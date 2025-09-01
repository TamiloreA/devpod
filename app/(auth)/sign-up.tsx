import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import {
  Mail,
  Lock,
  User as UserIcon,
  ArrowRight,
  Eye,
  EyeOff,
  Github,
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';

export default function SignUpScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<'Junior' | 'Mid' | 'Senior' | ''>('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    displayName?: string;
    email?: string;
    password?: string;
    confirm?: string;
    level?: string;
    terms?: string;
  }>({});

  const levels: Array<'Junior' | 'Mid' | 'Senior'> = ['Junior', 'Mid', 'Senior'];

  const emailRef = useRef<TextInput>(null);
  const pwdRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const buttonScale = useSharedValue(1);
  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    [email]
  );

  const pwdChecks = useMemo(() => {
    const len8 = password.length >= 8;
    const len12 = password.length >= 12;
    const upper = /[A-Z]/.test(password);
    const num = /\d/.test(password);
    const sym = /[^A-Za-z0-9]/.test(password);
    const score = [len8, len12, upper, num, sym].filter(Boolean).length;
    return { len8, len12, upper, num, sym, score };
  }, [password]);

  const passwordsMatch = useMemo(() => confirm.length > 0 && password === confirm, [password, confirm]);

  const formValid =
    displayName.trim().length > 1 &&
    emailValid &&
    pwdChecks.len8 &&
    passwordsMatch &&
    level !== '' &&
    acceptTerms;

  const validate = () => {
    const next: typeof errors = {};
    if (displayName.trim().length < 2) next.displayName = 'Please enter your name';
    if (!emailValid) next.email = 'Enter a valid email address';
    if (!pwdChecks.len8) next.password = 'Password must be at least 8 characters';
    if (!passwordsMatch) next.confirm = 'Passwords do not match';
    if (!level) next.level = 'Select your level';
    if (!acceptTerms) next.terms = 'Please accept the terms';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSignUp = async () => {
    buttonScale.value = withSpring(0.96, { duration: 90 }, () => {
      buttonScale.value = withSpring(1);
    });
  
    if (!validate()) return;
  
    setSubmitting(true);
    setErrors((prev) => ({ ...prev, email: undefined, password: undefined }));
  
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            display_name: displayName?.trim(),
            level, 
          },
        },
      });
  
      if (error) {
        let msg = error.message;
        if (/already registered|user already exists/i.test(msg)) msg = 'Email is already registered.';
        if (/password/i.test(msg)) msg = 'Password does not meet requirements.';
        setErrors((prev) => ({ ...prev, email: msg }));
        return;
      }
  
      const userId = data.user?.id;
  
      if (data.session && userId) {
        const { error: upsertErr } = await supabase.from('profiles').upsert({
          id: userId,
          email: email.trim().toLowerCase(),
          display_name: displayName?.trim(),
          level,
        });
        if (upsertErr) {
          console.warn('Profile upsert failed:', upsertErr.message);
        }
        router.replace('/(tabs)');
        return;
      }

      alert('Check your email to confirm your account.');
      router.replace('/(auth)/sign-in');
    } catch (e: any) {
      setErrors((prev) => ({
        ...prev,
        email: e?.message ?? 'Sign up failed. Try a different email.',
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const onSocial = async (provider: 'github' | 'google') => {
    setSubmitting(true);
    try {
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#0a0a0a', '#000000']} style={styles.gradient}>
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.header}>
              <Text style={styles.title}>Join DevPods</Text>
              <Text style={styles.subtitle}>Start collaborating with developers worldwide</Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.formContainer}>
              <BlurView intensity={20} style={styles.formGlass}>
                <View style={styles.form}>
                  <View style={[styles.inputContainer, errors.displayName && styles.inputError]}>
                    <UserIcon color={errors.displayName ? '#ff6969' : '#666666'} size={20} />
                    <TextInput
                      style={styles.input}
                      placeholder="Display Name"
                      placeholderTextColor="#666666"
                      value={displayName}
                      onChangeText={(t) => {
                        setDisplayName(t);
                        if (errors.displayName) setErrors((e) => ({ ...e, displayName: undefined }));
                      }}
                      returnKeyType="next"
                      onSubmitEditing={() => emailRef.current?.focus()}
                    />
                  </View>
                  {errors.displayName ? (
                    <Text style={styles.helperError}>{errors.displayName}</Text>
                  ) : null}

                  <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                    <Mail color={errors.email ? '#ff6969' : '#666666'} size={20} />
                    <TextInput
                      ref={emailRef}
                      style={styles.input}
                      placeholder="Email"
                      placeholderTextColor="#666666"
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t);
                        if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
                      }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      returnKeyType="next"
                      onSubmitEditing={() => pwdRef.current?.focus()}
                    />
                  </View>
                  {errors.email ? <Text style={styles.helperError}>{errors.email}</Text> : null}

                  <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                    <Lock color={errors.password ? '#ff6969' : '#666666'} size={20} />
                    <TextInput
                      ref={pwdRef}
                      style={styles.input}
                      placeholder="Password"
                      placeholderTextColor="#666666"
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t);
                        if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
                      }}
                      secureTextEntry={!showPwd}
                      autoCapitalize="none"
                      returnKeyType="next"
                      onSubmitEditing={() => confirmRef.current?.focus()}
                    />
                    <Pressable
                      onPress={() => setShowPwd((s) => !s)}
                      hitSlop={10}
                      style={styles.eyeBtn}
                      accessibilityRole="button"
                      accessibilityLabel={showPwd ? 'Hide password' : 'Show password'}
                    >
                      {showPwd ? <EyeOff size={18} color="#aaaaaa" /> : <Eye size={18} color="#aaaaaa" />}
                    </Pressable>
                  </View>
                  {errors.password ? <Text style={styles.helperError}>{errors.password}</Text> : null}

                  <View style={styles.meterRow}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.meterBar,
                          i < pwdChecks.score ? styles.meterBarActive : null,
                        ]}
                      />
                    ))}
                  </View>
                  <View style={styles.checklistRow}>
                    <Text style={[styles.checkItem, pwdChecks.len8 ? styles.checkOn : styles.checkOff]}>
                      • 8+ chars
                    </Text>
                    <Text style={[styles.checkItem, pwdChecks.upper ? styles.checkOn : styles.checkOff]}>
                      • Uppercase
                    </Text>
                    <Text style={[styles.checkItem, pwdChecks.num ? styles.checkOn : styles.checkOff]}>
                      • Number
                    </Text>
                    <Text style={[styles.checkItem, pwdChecks.sym ? styles.checkOn : styles.checkOff]}>
                      • Symbol
                    </Text>
                  </View>

                  <View style={[styles.inputContainer, errors.confirm && styles.inputError]}>
                    <Lock color={errors.confirm ? '#ff6969' : '#666666'} size={20} />
                    <TextInput
                      ref={confirmRef}
                      style={styles.input}
                      placeholder="Confirm Password"
                      placeholderTextColor="#666666"
                      value={confirm}
                      onChangeText={(t) => {
                        setConfirm(t);
                        if (errors.confirm) setErrors((e) => ({ ...e, confirm: undefined }));
                      }}
                      secureTextEntry={!showConfirm}
                      autoCapitalize="none"
                      returnKeyType="go"
                      onSubmitEditing={handleSignUp}
                    />
                    <Pressable
                      onPress={() => setShowConfirm((s) => !s)}
                      hitSlop={10}
                      style={styles.eyeBtn}
                      accessibilityRole="button"
                      accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}
                    >
                      {showConfirm ? <EyeOff size={18} color="#aaaaaa" /> : <Eye size={18} color="#aaaaaa" />}
                    </Pressable>
                  </View>
                  {errors.confirm ? <Text style={styles.helperError}>{errors.confirm}</Text> : null}

                  <Text style={styles.levelLabel}>Developer Level</Text>
                  <View style={styles.levelContainer}>
                    {levels.map((lvl) => {
                      const selected = level === lvl;
                      return (
                        <TouchableOpacity
                          key={lvl}
                          style={[styles.levelOption, selected && styles.levelSelected]}
                          onPress={() => {
                            setLevel(lvl);
                            if (errors.level) setErrors((e) => ({ ...e, level: undefined }));
                          }}
                          activeOpacity={0.9}
                        >
                          <Text style={[styles.levelText, selected && styles.levelTextSelected]}>{lvl}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {errors.level ? <Text style={styles.helperError}>{errors.level}</Text> : null}

                  <TouchableOpacity
                    style={styles.termsRow}
                    onPress={() => {
                      setAcceptTerms((v) => !v);
                      if (errors.terms) setErrors((e) => ({ ...e, terms: undefined }));
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.checkbox, acceptTerms && styles.checkboxOn]}>
                      {acceptTerms ? <Ionicons name="checkmark" size={14} color="#000" /> : null}
                    </View>
                    <Text style={styles.termsText}>
                      I agree to the <Text style={styles.linkHighlight}>Terms</Text> &{' '}
                      <Text style={styles.linkHighlight}>Privacy Policy</Text>
                    </Text>
                  </TouchableOpacity>
                  {errors.terms ? <Text style={styles.helperError}>{errors.terms}</Text> : null}

                  <Animated.View style={[buttonAnimatedStyle, { marginTop: 6 }]}>
                    <TouchableOpacity
                      style={[styles.signUpButton, (!formValid || submitting) && styles.signUpDisabled]}
                      onPress={handleSignUp}
                      activeOpacity={0.85}
                      disabled={!formValid || submitting}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#000" />
                      ) : (
                        <>
                          <Text style={styles.signUpText}>Create Account</Text>
                          <ArrowRight color="#000000" size={20} />
                        </>
                      )}
                    </TouchableOpacity>
                  </Animated.View>

                  <View style={styles.dividerRow}>
                    <View style={styles.divider} />
                    <Text style={styles.dividerText}>or continue with</Text>
                    <View style={styles.divider} />
                  </View>

                  <View style={styles.socialRow}>
                    <TouchableOpacity
                      style={styles.socialBtn}
                      onPress={() => onSocial('github')}
                      activeOpacity={0.9}
                    >
                      <Github size={18} color="#fff" />
                      <Text style={styles.socialText}>GitHub</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.socialBtn}
                      onPress={() => onSocial('google')}
                      activeOpacity={0.9}
                    >
                      <Ionicons name="logo-google" size={18} color="#fff" />
                      <Text style={styles.socialText}>Google</Text>
                    </TouchableOpacity>
                  </View>

                  <Link href="/(auth)/sign-in" asChild>
                    <TouchableOpacity style={styles.linkButton}>
                      <Text style={styles.linkText}>
                        Already have an account? <Text style={styles.linkHighlight}>Sign In</Text>
                      </Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </BlurView>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  content: { flex: 1 },
  scrollContent: { justifyContent: 'center', paddingHorizontal: 24, minHeight: '100%' },

  header: { alignItems: 'center', marginBottom: 48 },
  title: { fontSize: 32, fontFamily: 'Inter-SemiBold', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 16, fontFamily: 'Inter-Regular', color: '#999999', textAlign: 'center' },

  formContainer: { width: '100%' },
  formGlass: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  form: { padding: 32 },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  input: { flex: 1, marginLeft: 12, fontSize: 16, fontFamily: 'Inter-Regular', color: '#ffffff' },
  inputError: { borderColor: 'rgba(255,105,105,0.7)', backgroundColor: 'rgba(255,105,105,0.08)' },
  helperError: { color: '#ff8f8f', fontSize: 12, marginBottom: 8, marginLeft: 6 },

  eyeBtn: { paddingHorizontal: 4, paddingVertical: 4 },

  levelLabel: { fontSize: 14, fontFamily: 'Inter-Medium', color: '#ffffff', marginBottom: 12, marginTop: 8 },
  levelContainer: { flexDirection: 'row', marginBottom: 12 },
  levelOption: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingVertical: 12,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  levelSelected: { backgroundColor: 'rgba(255, 255, 255, 0.2)', borderColor: 'rgba(255, 255, 255, 0.3)' },
  levelText: { textAlign: 'center', fontSize: 14, fontFamily: 'Inter-Regular', color: '#999999' },
  levelTextSelected: { color: '#ffffff', fontFamily: 'Inter-Medium' },

  meterRow: { flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 6 },
  meterBar: { flex: 1, height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)' },
  meterBarActive: { backgroundColor: '#ffffff' },
  checklistRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  checkItem: { fontSize: 11 },
  checkOn: { color: '#cfe3ff' },
  checkOff: { color: '#6f6f6f' },

  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxOn: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  termsText: { color: '#cfcfcf', fontSize: 12 },

  signUpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 16,
    marginTop: 4,
    gap: 8,
  },
  signUpDisabled: { opacity: 0.5 },
  signUpText: { fontSize: 16, fontFamily: 'Inter-SemiBold', color: '#000000' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },
  divider: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { color: '#8f8f8f', fontSize: 12 },
  socialRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  socialText: { color: '#fff', fontFamily: 'Inter-Medium' },

  linkButton: { alignItems: 'center', marginTop: 6 },
  linkText: { fontSize: 14, fontFamily: 'Inter-Regular', color: '#999999' },
  linkHighlight: { color: '#ffffff', fontFamily: 'Inter-Medium' },
});
