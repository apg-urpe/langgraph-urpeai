'use client';

import React, { useState } from 'react';
import { supabase } from '../lib/supabase-client';
import { useLanguageStore } from '../store/languageStore';
import { translations } from '../lib/i18n';
import { 
  ShieldCheck, 
  Mail, 
  ArrowRight, 
  Cpu, 
  AlertOctagon,
  Loader2,
  ChevronLeft,
  Sparkles,
  Globe,
  CheckCircle2,
  Shield,
  Zap,
  KeyRound,
  X,
  Eye,
  EyeOff
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Password login state (for local testing)
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordEmail, setPasswordEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const { language, setLanguage } = useLanguageStore();
  const t = translations[language].login as any;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      // Magic Link (OTP) - works for both new and existing users
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          // Auto-create account for new users
          shouldCreateUser: true,
        },
      });

      if (otpError) {
        // Check for rate limiting
        if (otpError.message?.includes('rate') || otpError.message?.includes('limit')) {
          throw new Error(t.err_rate_limit);
        }
        throw otpError;
      }

      // Success - show confirmation
      setLinkSent(true);
      setMessage(t.msg_magic_link_sent);
      
    } catch (err: any) {
      setError(err.message || t.err_auth_failed);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setLinkSent(false);
    setEmail('');
    setError(null);
    setMessage(null);
  };

  // Password login handler (for local testing)
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPasswordLoading(true);
    setPasswordError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: passwordEmail,
        password: password,
      });

      if (error) throw error;
      
      // Success - modal will close automatically when auth state changes
      setShowPasswordModal(false);
    } catch (err: any) {
      setPasswordError(err.message || 'Authentication failed');
    } finally {
      setIsPasswordLoading(false);
    }
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordEmail('');
    setPassword('');
    setPasswordError(null);
  };

  // Success state - Link sent
  if (linkSent) {
    return (
      <div className="min-h-screen w-full bg-zinc-950 flex items-center justify-center relative overflow-hidden selection:bg-primary-500/30 selection:text-primary-100">
        {/* Background */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none animate-pulse"></div>

        <div className="w-full max-w-md z-10 p-6 animate-pop-in">
          <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/60 rounded-2xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] text-center">
            
            {/* Success Icon */}
            <div className="relative mx-auto w-20 h-20 mb-6">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping"></div>
              <div className="relative w-full h-full bg-zinc-900 rounded-full border-2 border-emerald-500/50 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-zinc-100 mb-2">
              {language === 'es' ? '¡Enlace Enviado!' : 'Link Sent!'}
            </h2>
            <p className="text-sm text-zinc-400 mb-6">
              {message}
            </p>

            {/* Email Display */}
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 mb-6">
              <div className="flex items-center justify-center gap-2 text-primary-400">
                <Mail className="w-4 h-4" />
                <span className="text-sm font-mono">{email}</span>
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-3 text-left mb-6">
              <div className="flex items-start gap-3 text-xs text-zinc-400">
                <div className="w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-primary-400 font-bold">1</span>
                </div>
                <span>{language === 'es' ? 'Revisa tu bandeja de entrada' : 'Check your email inbox'}</span>
              </div>
              <div className="flex items-start gap-3 text-xs text-zinc-400">
                <div className="w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-primary-400 font-bold">2</span>
                </div>
                <span>{language === 'es' ? 'Haz clic en el enlace seguro' : 'Click the secure link'}</span>
              </div>
              <div className="flex items-start gap-3 text-xs text-zinc-400">
                <div className="w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-primary-400 font-bold">3</span>
                </div>
                <span>{language === 'es' ? 'Serás autenticado automáticamente' : 'You\'ll be authenticated automatically'}</span>
              </div>
            </div>

            {/* Try Again Button */}
            <button
              onClick={resetForm}
              className="w-full flex items-center justify-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors py-2 border border-zinc-800 rounded-xl hover:border-zinc-700"
            >
              <ChevronLeft className="w-3 h-3" />
              {language === 'es' ? 'Usar otro correo' : 'Use different email'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-zinc-950 flex items-center justify-center relative overflow-hidden selection:bg-primary-500/30 selection:text-primary-100">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none"></div>
      <div className="absolute inset-0 bg-grid-subtle opacity-20 pointer-events-none animate-pulse"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Language Toggle (Top Right) */}
      <div className="absolute top-6 right-6 z-20 animate-fade-in-up">
        <div className="flex items-center bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-lg p-1 shadow-lg">
           <div className="px-2 text-zinc-600">
              <Globe className="w-3.5 h-3.5" />
           </div>
           <button 
             onClick={() => setLanguage('en')}
             className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${
               language === 'en' 
                 ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700' 
                 : 'text-zinc-500 hover:text-zinc-300'
             }`}
           >
             EN
           </button>
           <div className="w-px h-3 bg-zinc-800 mx-1"></div>
           <button 
             onClick={() => setLanguage('es')}
             className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${
               language === 'es' 
                 ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700' 
                 : 'text-zinc-500 hover:text-zinc-300'
             }`}
           >
             ES
           </button>
        </div>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-md z-10 p-6 animate-pop-in">
        
        {/* Header Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary-600 to-cyan-400 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
            <div className="w-16 h-16 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center justify-center relative shadow-2xl">
              <ShieldCheck className="w-8 h-8 text-primary-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-zinc-950 rounded-full border border-zinc-800 flex items-center justify-center">
               <div className="w-2 h-2 rounded-full animate-pulse bg-emerald-500"></div>
            </div>
          </div>
          
          <div className="text-center">
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight font-sans uppercase">
              {t.title_signin}
            </h1>
            <p className="text-xs text-primary-400/80 font-mono tracking-widest mt-1 uppercase">
              {t.subtitle_signin}
            </p>
          </div>
        </div>

        {/* Auth Form Card */}
        <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/60 rounded-2xl p-6 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden group">
          
          {/* Top Scan Line */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary-500/50 to-transparent animate-shimmer"></div>

          <form onSubmit={handleAuth} className="space-y-5">
            
            {/* Error Display */}
            {error && (
              <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-lg flex items-start gap-2 animate-fade-in-up">
                <AlertOctagon className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                <p className="text-xs text-rose-200">{error}</p>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">{t.label_email}</label>
              <div className="relative group/input">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within/input:text-primary-400 transition-colors">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.placeholder_email}
                  autoComplete="email"
                  className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl py-3.5 pl-10 pr-4 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all"
                />
              </div>
            </div>

            {/* Magic Link Info */}
            <div className="p-3 bg-zinc-950/30 border border-zinc-800/50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">
                  {language === 'es' ? 'Acceso sin contraseña' : 'Passwordless Access'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                {t.magic_link_info}
              </p>
            </div>

            {/* Benefits */}
            <div className="flex justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <Shield className="w-3 h-3 text-emerald-500/70" />
                <span>{t.magic_link_benefit_1}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <Zap className="w-3 h-3 text-amber-500/70" />
                <span>{t.magic_link_benefit_2}</span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full mt-2 relative group/btn overflow-hidden rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold py-3.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="relative z-10 flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t.processing}</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    <span>{t.btn_signin}</span>
                    <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                  </>
                )}
              </div>
              {/* Shine effect */}
              <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent transform -skew-x-12 group-hover/btn:animate-[shimmer_1.5s_infinite]"></div>
            </button>
          </form>

        </div>

        {/* Footer Status */}
        <div className="mt-8 flex items-center justify-center gap-2 opacity-50">
           <Cpu className="w-3 h-3 text-zinc-600" />
           <span className="text-[9px] text-zinc-600 font-mono tracking-widest">
             {t.status_secure}
           </span>
        </div>

      </div>

      {/* Password Login Button (Dev/Testing) - Bottom Left */}
      <button
        onClick={() => setShowPasswordModal(true)}
        className="fixed bottom-4 left-4 z-50 p-2.5 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/50 rounded-lg text-zinc-500 hover:text-zinc-300 transition-all hover:scale-105 active:scale-95 backdrop-blur-sm group"
        title={language === 'es' ? 'Login con contraseña (dev)' : 'Password login (dev)'}
      >
        <KeyRound className="w-4 h-4 group-hover:text-amber-400 transition-colors" />
      </button>

      {/* Password Login Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm mx-4 bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-2xl animate-pop-in">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    {language === 'es' ? 'Login con Contraseña' : 'Password Login'}
                  </h3>
                  <p className="text-[10px] text-zinc-500">
                    {language === 'es' ? 'Solo para desarrollo local' : 'For local development only'}
                  </p>
                </div>
              </div>
              <button
                onClick={closePasswordModal}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Password Login Form */}
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              
              {/* Error */}
              {passwordError && (
                <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-lg flex items-start gap-2">
                  <AlertOctagon className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-rose-200">{passwordError}</p>
                </div>
              )}

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    required
                    value={passwordEmail}
                    onChange={(e) => setPasswordEmail(e.target.value)}
                    placeholder="test@example.com"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  {language === 'es' ? 'Contraseña' : 'Password'}
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg py-2.5 pl-10 pr-10 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isPasswordLoading || !passwordEmail || !password}
                className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-900 font-bold py-2.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPasswordLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{language === 'es' ? 'Ingresando...' : 'Signing in...'}</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>{language === 'es' ? 'Ingresar' : 'Sign In'}</span>
                  </>
                )}
              </button>
            </form>

          </div>
        </div>
      )}
    </div>
  );
};
