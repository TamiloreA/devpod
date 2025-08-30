import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
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
import { Mail, Lock, ArrowRight, Eye, EyeOff, Github } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons'; 

const { width } = Dimensions.get('window');

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const buttonScale = useSharedValue(1);
  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    [email]
  );
  const passwordValid = useMemo(() => password.length >= 6, [password]);
  const formValid = emailValid && passwordValid;

  const validate = () => {
    const next: typeof errors = {};
    if (!emailValid) next.email = 'Enter a valid email address';
    if (!passwordValid) next.password = 'Password must be at least 6 characters';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSignIn = async () => {
    buttonScale.value = withSpring(0.96, { duration: 90 }, () => {
      buttonScale.value = withSpring(1);
    });

    if (!validate()) return;
    setSubmitting(true);
    try {
    } catch (e) {
      setErrors((prev) => ({ ...prev, password: 'Invalid credentials. Try again.' }));
    } finally {
      setSubmitting(false);
    }
  };

  const onForgotPassword = () => {
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
          <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.header}>
            <Text style={styles.title}>DevPods</Text>
            <Text style={styles.subtitle}>AI-native developer collaboration</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.formContainer}>
            <BlurView intensity={20} style={styles.formGlass}>
              <View style={styles.form}>
                <View
                  style={[
                    styles.inputContainer,
                    errors.email && styles.inputError,
                  ]}
                >
                  <Mail color={errors.email ? '#ff6969' : '#666666'} size={20} />
                  <TextInput
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
                    onSubmitEditing={() => {
                    }}
                    accessible
                    accessibilityLabel="Email"
                  />
                </View>
                {errors.email ? <Text style={styles.helperError}>{errors.email}</Text> : null}

                <View
                  style={[
                    styles.inputContainer,
                    { marginTop: 8 },
                    errors.password && styles.inputError,
                  ]}
                >
                  <Lock color={errors.password ? '#ff6969' : '#666666'} size={20} />
                  <TextInput
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
                    returnKeyType="go"
                    onSubmitEditing={handleSignIn}
                    accessible
                    accessibilityLabel="Password"
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
                {errors.password ? (
                  <Text style={styles.helperError}>{errors.password}</Text>
                ) : (
                  <TouchableOpacity onPress={onForgotPassword} style={styles.forgotRow}>
                    <Text style={styles.forgotText}>Forgot password?</Text>
                  </TouchableOpacity>
                )}

                <Animated.View style={[buttonAnimatedStyle, { marginTop: 4 }]}>
                  <TouchableOpacity
                    style={[styles.signInButton, (!formValid || submitting) && styles.signInDisabled]}
                    onPress={handleSignIn}
                    activeOpacity={0.85}
                    disabled={!formValid || submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <>
                        <Text style={styles.signInText}>Sign In</Text>
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

                <Link href="/(auth)/sign-up" asChild>
                  <TouchableOpacity style={styles.linkButton}>
                    <Text style={styles.linkText}>
                      Don&apos;t have an account?{' '}
                      <Text style={styles.linkHighlight}>Sign Up</Text>
                    </Text>
                  </TouchableOpacity>
                </Link>

                <Text style={styles.legalText}>
                  By continuing, you agree to our <Text style={styles.linkHighlight}>Terms</Text> &{' '}
                  <Text style={styles.linkHighlight}>Privacy Policy</Text>.
                </Text>
              </View>
            </BlurView>
          </Animated.View>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
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
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
  },
  inputError: {
    borderColor: 'rgba(255,105,105,0.7)',
    backgroundColor: 'rgba(255,105,105,0.08)',
  },
  helperError: { color: '#ff8f8f', fontSize: 12, marginBottom: 8, marginLeft: 6 },

  eyeBtn: { paddingHorizontal: 4, paddingVertical: 4 },

  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 16,
    gap: 8,
  },
  signInDisabled: { opacity: 0.5 },
  signInText: { fontSize: 16, fontFamily: 'Inter-SemiBold', color: '#000000' },

  forgotRow: { alignSelf: 'flex-end', marginBottom: 6 },
  forgotText: { color: '#cfcfcf', fontSize: 12 },

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

  legalText: { color: '#6f6f6f', fontSize: 12, textAlign: 'center', marginTop: 6 },
});
