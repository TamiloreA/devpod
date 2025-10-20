import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getLiveKitToken } from '@/lib/livekit';
import {
  Room,
  RoomEvent,
  LocalTrackPublication,
  Track,
  createLocalAudioTrack,
} from 'livekit-client';
import { Audio } from 'expo-av';

type PresenceUser = {
  id: string;
  name: string;
  joinedAt: number;
  muted?: boolean;
};

type RoomState = {
  version: number;
  hostId: string | null;
  queue: string[];
  idx: number;
  isPaused: boolean;
  endsAt: number | null;
  slotSecs: number;
};

type Props = {
  podId: string;
  selfId: string;
  selfName: string;
  onLeave?: () => void;
};

const SLOT_DEFAULT = 60;

async function requestMicPermission() {
  const { granted, status } = await Audio.requestPermissionsAsync();
  if (!granted) {
    throw new Error(`Microphone permission ${status}`);
  }
}

export default function StandupRoom({ podId, selfId, selfName, onLeave }: Props) {
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);
  const [peers, setPeers] = useState<Record<string, PresenceUser>>({});
  const [state, setState] = useState<RoomState>({
    version: 0,
    hostId: null,
    queue: [],
    idx: 0,
    isPaused: true,
    endsAt: null,
    slotSecs: SLOT_DEFAULT,
  });
  const [now, setNow] = useState(Date.now());

  const [lkRoom, setLkRoom] = useState<Room | null>(null);
  const audioPubRef = useRef<LocalTrackPublication | null>(null);

  const stateRef = useRef(state);
  const peersRef = useRef(peers);
  const readyRef = useRef(false);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { peersRef.current = peers; }, [peers]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const broadcastState = (nextPartial: Partial<RoomState> = {}) => {
    if (!channel) return;
    const current = stateRef.current;
    const merged: RoomState = {
      ...current,
      ...nextPartial,
      version: (current.version ?? 0) + 1,
    };
    setState(merged);
    channel.send({ type: 'broadcast', event: 'room_state', payload: merged });
  };

  // Prefer (un)publishing to fully release the mic when not speaking
  const ensureMic = async (shouldBeOn: boolean) => {
    if (!lkRoom) return;
    try {
      let pub =
        audioPubRef.current ??
        (lkRoom.localParticipant
          .getTrackPublications()
          .find((p) => p.kind === Track.Kind.Audio) as LocalTrackPublication | undefined) ??
        null;

      if (shouldBeOn) {
        if (pub && !pub.isMuted) {
          audioPubRef.current = pub;
          return;
        }
        // (re)create & publish mic
        const track = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        const createdPub = (await lkRoom.localParticipant.publishTrack(track)) as LocalTrackPublication;
        audioPubRef.current = createdPub;
        return;
      }

      // Turn off mic completely when not the speaker
      if (pub) {
        try {
          if (pub.track) {
            await lkRoom.localParticipant.unpublishTrack(pub.track, true);
          }
        } catch {}
        audioPubRef.current = null;
      }
    } catch (e) {
      console.warn('ensureMic error', e);
    }
  };

  useEffect(() => {
    const ch = supabase.channel(`standup:${podId}`, {
      config: { presence: { key: selfId } },
    });

    ch.on('presence', { event: 'sync' }, () => {
      const ps = ch.presenceState() as Record<string, any[]>;
      const mapped: Record<string, PresenceUser> = {};
      Object.entries(ps).forEach(([uid, arr]) => {
        const latest = (arr && arr.length ? arr[arr.length - 1] : {}) as any;
        mapped[String(uid)] = {
          id: String(uid),
          name: latest.name || 'Member',
          joinedAt: latest.joinedAt || Date.now(),
          muted: !!latest.muted,
        };
      });
      setPeers(mapped);

      const s = stateRef.current;
      if (s.hostId === selfId) {
        ch.send({ type: 'broadcast', event: 'room_state', payload: s });
      }
    });

    ch.on('broadcast', { event: 'room_state' }, (payload) => {
      const next = payload.payload as RoomState;
      const cur = stateRef.current;
      if ((next.version ?? 0) >= (cur.version ?? 0)) {
        setState(next);
      }
    });

    ch.on('broadcast', { event: 'req_state' }, () => {
      const s = stateRef.current;
      if (s.hostId === selfId) {
        ch.send({ type: 'broadcast', event: 'room_state', payload: s });
      }
    });

    ch.on('broadcast', { event: 'control' }, (payload) => {
      const msg = payload.payload as { type: string; [k: string]: any };
      const s = stateRef.current;

      if (msg.type === 'reset') {
        const next: RoomState = {
          version: (s.version ?? 0) + 1,
          hostId: msg.hostId ?? s.hostId,
          queue: msg.queue ?? [],
          idx: 0,
          isPaused: true,
          endsAt: null,
          slotSecs: msg.slotSecs ?? s.slotSecs,
        };
        setState(next);
        return;
      }

      if (msg.type === 'done') {
        if (s.hostId === selfId) {
          const hasQueue = s.queue.length > 0;
          const nextIdx = hasQueue ? (s.idx + 1) % s.queue.length : 0;
          const endsAt = hasQueue ? Date.now() + s.slotSecs * 1000 : null;
          const merged: RoomState = {
            ...s,
            version: (s.version ?? 0) + 1,
            idx: nextIdx,
            isPaused: !endsAt,
            endsAt: endsAt ?? null,
          };
          setState(merged);
          ch.send({ type: 'broadcast', event: 'room_state', payload: merged });
        }
      }
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ id: selfId, name: selfName, joinedAt: Date.now(), muted: false });
        readyRef.current = true;
        ch.send({ type: 'broadcast', event: 'req_state', payload: { requester: selfId, ts: Date.now() } });
      }
    });

    setChannel(ch);
    return () => {
      readyRef.current = false;
      ch.unsubscribe();
      setChannel(null);
    };
  }, [podId, selfId, selfName]);

  useEffect(() => {
    if (state.hostId && !peers[state.hostId]) {
      setState((s) => ({
        ...s,
        version: (s.version ?? 0) + 1,
        hostId: null,
        isPaused: true,
        endsAt: null,
      }));
    }
  }, [peers, state.hostId]);

  const isHost = state.hostId === selfId;

  const electHostIfNone = () => {
    if (!readyRef.current) return;
    if (!stateRef.current.hostId) broadcastState({ hostId: selfId });
  };

  const startStandup = () => {
    const ids = Object.keys(peersRef.current);
    const sorted = ids.sort(
      (a, b) => (peersRef.current[a].joinedAt || 0) - (peersRef.current[b].joinedAt || 0),
    );
    const endsAt = Date.now() + stateRef.current.slotSecs * 1000;
    if (!stateRef.current.hostId) {
      broadcastState({ hostId: selfId, queue: sorted, idx: 0, isPaused: false, endsAt });
    } else {
      broadcastState({ queue: sorted, idx: 0, isPaused: false, endsAt });
    }
  };

  const nextSpeaker = () => {
    const s = stateRef.current;
    if (!isHost || s.queue.length === 0) return;
    const nextIdx = (s.idx + 1) % s.queue.length;
    const endsAt = Date.now() + s.slotSecs * 1000;
    broadcastState({ idx: nextIdx, isPaused: false, endsAt });
  };

  const pauseResume = () => {
    const s = stateRef.current;
    if (!isHost) return;
    if (s.isPaused) {
      const endsAt = Date.now() + s.slotSecs * 1000;
      broadcastState({ isPaused: false, endsAt });
    } else {
      broadcastState({ isPaused: true, endsAt: null });
    }
  };

  const reset = () => {
    if (!isHost) return;
    broadcastState({ idx: 0, isPaused: true, endsAt: null });
  };

  const currentId = state.queue[state.idx];
  const timeLeft = state.isPaused || !state.endsAt
    ? state.slotSecs
    : Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  const someoneSpeaking = !state.isPaused && !!currentId;
  const iAmCurrent = someoneSpeaking && currentId === selfId;

  useEffect(() => {
    if (!someoneSpeaking) return;
    if (timeLeft <= 0 && isHost) nextSpeaker();
  }, [timeLeft, someoneSpeaking, isHost]);

  const roster = useMemo(() => Object.values(peers), [peers]);

  useEffect(() => {
    let isCancelled = false;
    let room: Room | null = null;

    (async () => {
      try {
        await requestMicPermission();

        // ensure native audio session supports record + playback
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        } catch (e) {
          console.warn('Audio.setAudioModeAsync failed', e);
        }

        const { token, url } = await getLiveKitToken({
          room: `standup-${podId}`,
          displayName: selfName,
        });

        room = new Room({
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: { dtx: true },
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        room
          .on(RoomEvent.ConnectionStateChanged, () => {})
          .on(RoomEvent.TrackSubscribed, () => {})
          .on(RoomEvent.Disconnected, () => {});

        await room.connect(url, token, { autoSubscribe: true });
        if (isCancelled) {
          await room.disconnect();
          return;
        }
        setLkRoom(room);
      } catch (e) {
        console.warn('LiveKit connect error', e);
      }
    })();

    return () => {
      isCancelled = true;
      (async () => {
        try {
          if (audioPubRef.current?.track) {
            try {
              await room?.localParticipant.unpublishTrack(audioPubRef.current.track, true);
            } catch {}
            audioPubRef.current = null;
          }
          await room?.disconnect();
        } catch {}
      })();
    };
  }, [podId, selfName]);

  useEffect(() => {
    ensureMic(iAmCurrent && !state.isPaused).catch(() => {});
  }, [iAmCurrent, state.isPaused, lkRoom]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Standup</Text>
        <Text style={styles.subtitle}>
          {roster.length} joined • {state.slotSecs}s each {state.hostId ? `• Host: ${peers[state.hostId]?.name ?? '—'}` : '• No host'}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {roster.map((p) => {
          const isCurrent = p.id === currentId && someoneSpeaking;
          return (
            <View key={p.id} style={[styles.person, isCurrent && styles.personActive]}>
              <Text style={[styles.personName, isCurrent && styles.personNameActive]} numberOfLines={1}>
                {p.name}{p.id === selfId ? ' (you)' : ''}
              </Text>
              {isCurrent && <Text style={styles.badge}>speaking</Text>}
            </View>
          );
        })}
        {roster.length === 0 && (
          <Text style={{ color: '#9aa0a6', textAlign: 'center', marginTop: 20 }}>
            Waiting for others to join…
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.timer}>{timeLeft.toString().padStart(2, '0')}s</Text>

        {isHost ? (
          <View style={styles.controls}>
            {state.queue.length === 0 ? (
              <TouchableOpacity style={styles.primary} onPress={startStandup}>
                <Text style={styles.primaryText}>Start</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.secondary} onPress={pauseResume}>
                  <Text style={styles.secondaryText}>{state.isPaused ? 'Resume' : 'Pause'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondary} onPress={nextSpeaker}>
                  <Text style={styles.secondaryText}>Next</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghost} onPress={reset}>
                  <Text style={styles.ghostText}>Reset</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <View style={styles.controls}>
            {!state.hostId ? (
              <TouchableOpacity style={styles.primary} onPress={electHostIfNone}>
                <Text style={styles.primaryText}>Become host</Text>
              </TouchableOpacity>
            ) : currentId === selfId && !state.isPaused ? (
              <TouchableOpacity
                style={styles.secondary}
                onPress={() => channel?.send({ type: 'broadcast', event: 'control', payload: { type: 'done' } })}
              >
                <Text style={styles.secondaryText}>I’m done</Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ color: '#9aa0a6' }}>Waiting for host…</Text>
            )}
          </View>
        )}

        <TouchableOpacity style={styles.leave} onPress={onLeave}>
          <Text style={styles.leaveText}>Leave</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0d11' },
  header: { paddingTop: 54, paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#9aa0a6', fontSize: 12, marginTop: 4 },

  person: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  personActive: { borderColor: '#59d985', backgroundColor: 'rgba(89,217,133,0.08)' },
  personName: { color: '#e6edf3', fontSize: 14, fontWeight: '600', flex: 1, paddingRight: 8 },
  personNameActive: { color: '#fff' },
  badge: { color: '#59d985', fontSize: 10, fontWeight: '800' },

  footer: { padding: 12, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  timer: { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  primary: { backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12 },
  primaryText: { color: '#000', fontWeight: '800' },
  secondary: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(255,255,255,0.06)', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  secondaryText: { color: '#fff', fontWeight: '800' },
  ghost: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  ghostText: { color: '#9aa0a6', fontWeight: '800' },

  leave: { alignSelf: 'center', marginTop: 10, paddingHorizontal: 12, paddingVertical: 8 },
  leaveText: { color: '#9aa0a6' },
});
