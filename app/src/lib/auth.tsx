// Oturum yönetimi: giriş, kayıt, çıkış, profil bilgisi.
//
// `useAuth()` ile uygulamanın her yerinden "kim giriş yaptı, profili ne" bilgisine ulaşılır.
// Sunucu (Supabase) bağlı değilse uygulama çökmez; giriş ekranı bunu bir uyarıyla gösterir.

import type { AuthError, Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import {
  checkSignup,
  claimSession,
  getAccountStatus,
  loginEmail,
  SIGNUP_CHECK_TEXT,
  type AccountStatus,
} from '@/lib/account';
import { getDeviceId } from '@/lib/device';
import { startPurchases, stopPurchases, syncSubscription } from '@/lib/purchases';
import { setSessionReplacedHandler } from '@/lib/rpc';
import { isBackendReady, supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  full_name: string;
  alias: string;
  avatar_index: number;
  role: 'user' | 'admin' | 'sponsor';
  points: number;
  level_rewarded: number;
  premium_until: string | null;
  /** 'store' = uygulama içi satın alma, 'moderator' = moderatörün verdiği, boş = hiç abonelik alınmamış */
  premium_source: 'store' | 'moderator' | null;
  muted_until: string | null;
  banned_at: string | null;
  /** NVİ ile kimliği doğrulandıysa zamanı (gerçek ad nüfustaki addır, değiştirilemez) */
  identity_verified_at: string | null;
  /** Profil resmi (yalnızca doğrulanmış hesap): dosya yolu ve onay durumu */
  photo_path: string | null;
  photo_status: 'pending' | 'approved' | 'rejected' | null;
  /** Moderatör kontrolünün bittiği an (bu andan sonra resim onaylı sayılır) */
  photo_auto_at: string | null;
};

type Result = { error: string | null };
type SignUpResult = Result;

const REPLACED_TEXT = 'Hesabına başka bir telefondan giriş yapıldı. Bu telefondaki oturum kapatıldı.';
const BANNED_TEXT = 'Hesabın askıya alındı. Bir yanlışlık olduğunu düşünüyorsan bize ulaş.';

/**
 * Giriş yapılırken, oturum bu telefona geçene (claim_session) kadar profil okuması bekler. Yoksa yeni oturum,
 * hesabın eski oturumu hâlâ kayıtlıyken "başka telefondan girildi" sanılıp hemen kapatılırdı.
 */
let claimGate: Promise<void> | null = null;

type AuthState = {
  /** İlk açılışta oturum ve profil okunurken true */
  loading: boolean;
  /** Giriş yapılmış ve profil yüklenmişse true (geliştirici önizlemesi de sayılır) */
  isLoggedIn: boolean;
  profile: Profile | null;
  /** Hesap durumu: kurtarma kelimeleri, ad değiştirme hakkı, kullanıcı adı (okunamadıysa boş) */
  account: AccountStatus | null;
  /** Oturum var ama profil okunamadıysa açıklama metni */
  profileError: string | null;
  /** Giriş ekranında gösterilecek bilgi (ör. hesap askıya alındı) */
  notice: string | null;
  /** Sunucu yokken sadece geliştirmede ekranları gezmek için */
  previewMode: boolean;
  /** `login`: kullanıcı adı (eski hesaplarda e-posta) */
  signIn: (login: string, password: string) => Promise<Result>;
  /** inviteCode: isteğe bağlı davet kodu (geçersizse kayıt yine olur, yalnızca davet sayılmaz) */
  signUp: (fullName: string, username: string, password: string, inviteCode?: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  retryProfile: () => void;
  updateFullName: (name: string) => Promise<Result>;
  deleteAccount: (confirmText: string) => Promise<Result>;
  enterPreview: () => void;
  leavePreview: () => void;
  clearNotice: () => void;
};

const PROFILE_COLUMNS =
  'id, full_name, alias, avatar_index, role, points, level_rewarded, premium_until, premium_source, muted_until, banned_at, identity_verified_at, photo_path, photo_status, photo_auto_at';

const BACKEND_MISSING = 'Sunucu bağlantısı kurulmadı. .env dosyasındaki adres ve anahtarı doldurmalısın.';

const GENERIC_ERROR = 'Bir sorun oluştu. Biraz sonra tekrar dene.';

/** Supabase'in İngilizce hata kodlarını sade Türkçe cümlelere çevirir. */
function friendlyAuthError(error: AuthError): string {
  const code = (error as { code?: string }).code;
  const message = (error.message ?? '').toLowerCase();
  let text: string;

  switch (code) {
    case 'invalid_credentials':
      text = 'Kullanıcı adı veya şifre hatalı.';
      break;
    case 'email_not_confirmed':
      text = 'Hesap henüz etkin değil. (Yönetici: Supabase’de “Confirm email” kapalı olmalı.)';
      break;
    case 'user_already_exists':
    case 'email_exists':
      text = 'Bu kullanıcı adı alınmış. Başka bir ad dene.';
      break;
    case 'weak_password':
      text = 'Şifre çok zayıf. En az 8 karakter olsun ve harf ile rakam içersin.';
      break;
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      text = 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.';
      break;
    case 'signup_disabled':
      text = 'Yeni kayıtlar şu an kapalı.';
      break;
    case 'email_address_invalid':
    case 'validation_failed':
      text = 'Kullanıcı adı geçersiz görünüyor.';
      break;
    default:
      text =
        message.includes('network') || message.includes('fetch')
          ? 'İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.'
          : message.includes('database error saving new user')
            ? 'Kayıt oluşturulamadı. Adını ve kullanıcı adını kontrol edip tekrar dene.'
            : GENERIC_ERROR;
  }

  // Geliştirme sırasında asıl hata kodunu da göster (ekran görüntüsüyle bana iletmen için).
  return __DEV__ ? `${text} [${code ?? error.message}]` : text;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(!supabase);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const userId = session?.user.id ?? null;

  // 1) Kayıtlı oturumu oku ve değişiklikleri dinle
  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionLoaded(true);
    });

    // Not: bu fonksiyonun içinde başka Supabase çağrısı yapılmaz (kilitlenme riski).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionLoaded(true);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 2) Uygulama arka plana gidince oturum yenilemeyi durdur, dönünce başlat
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.startAutoRefresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (!supabase) return;
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => {
      sub.remove();
      supabase?.auth.stopAutoRefresh();
    };
  }, []);

  const fetchProfile = useCallback(async (id: string): Promise<'ok' | 'banned' | 'error'> => {
    if (!supabase) return 'error';
    // Rumuzlar her Pazartesi 00:00'da yenilenir. Yeni haftaya geçildiyse sunucu şimdi yeniler;
    // hata verirse (ör. ağ sorunu) profil okuma yine de denenir.
    try {
      await supabase.rpc('ensure_my_alias');
    } catch {
      /* önemli değil */
    }
    // Bu telefonda yeni giriş yapılıyorsa oturumun bu telefona geçmesi beklenir
    if (claimGate) await claimGate;
    const status = await getAccountStatus();
    if (status?.session === 'replaced' || status?.session === 'banned') {
      setNotice(status.session === 'replaced' ? REPLACED_TEXT : BANNED_TEXT);
      await supabase.auth.signOut({ scope: 'local' });
      return 'banned';
    }
    if (status) setAccount(status);
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      // 42703 = veritabanında olmayan bir sütun: uygulama yeni, Supabase'deki şema eski demektir.
      const schemaOutdated = error.code === '42703' || /does not exist/i.test(error.message ?? '');
      setProfileError(
        schemaOutdated
          ? 'Veritabanı güncel değil. Supabase’de SQL Editor’e yeni schema.sql dosyasının tamamını yapıştırıp Run’a bas, sonra uygulamayı yeniden aç.'
          : __DEV__
            ? `Profil okunamadı: ${error.message}`
            : 'Profil yüklenemedi. İnternet bağlantını kontrol et.',
      );
      return 'error';
    }
    if (!data) {
      setProfileError(
        __DEV__
          ? 'Bu hesabın profil satırı yok. schema.sql dosyası Supabase’de çalıştırılmamış olabilir.'
          : 'Profil bulunamadı. Lütfen çıkış yapıp tekrar giriş yap.',
      );
      return 'error';
    }
    if (data.banned_at) {
      setNotice(BANNED_TEXT);
      await supabase.auth.signOut({ scope: 'local' });
      return 'banned';
    }
    setProfile(data as Profile);
    setProfileError(null);
    return 'ok';
  }, []);

  // 3) Oturum açıldığında profili oku
  useEffect(() => {
    if (!sessionLoaded) return;
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
      setProfile(null);
      setAccount(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);
    fetchProfile(userId).finally(() => {
      if (!cancelled) setProfileLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionLoaded, userId, fetchProfile, retryTick]);

  const refreshProfile = useCallback(async () => {
    if (userId) await fetchProfile(userId);
  }, [userId, fetchProfile]);

  const refreshAccount = useCallback(async () => {
    const status = await getAccountStatus();
    if (status && status.session === 'ok') setAccount(status);
  }, []);

  // Tek oturum: başka telefondan giriş yapılınca bu telefon çıkış yapar. Sunucu her isteğe 'session_replaced'
  // der; ayrıca uygulamaya dönüldüğünde ve dakikada bir hesap durumu kontrol edilir.
  useEffect(() => {
    if (!supabase || !userId) return;
    let kicked = false;
    const kick = (text: string) => {
      if (kicked || claimGate) return;
      kicked = true;
      setNotice(text);
      void supabase?.auth.signOut({ scope: 'local' });
    };
    setSessionReplacedHandler(() => kick(REPLACED_TEXT));
    const check = async () => {
      if (claimGate) return;
      const status = await getAccountStatus();
      if (status?.session === 'replaced') kick(REPLACED_TEXT);
      else if (status?.session === 'banned') kick(BANNED_TEXT);
    };
    const timer = setInterval(() => void check(), 60_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      setSessionReplacedHandler(null);
      clearInterval(timer);
      sub.remove();
    };
  }, [userId]);

  // 4) Mağaza hesabını (satın alma) giriş yapan üyeyle eşle; çıkışta bırak
  useEffect(() => {
    if (!userId) {
      void stopPurchases();
      return;
    }
    void startPurchases(userId);
  }, [userId]);

  // 5) Aboneliği mağazadan alınmış üyelerde, uygulama açılışında bitiş tarihini sunucudan tazele
  //    (yenileme ya da iptal olduysa yansısın). Sunucu mağazaya kendisi sorar.
  const storeSubscription = profile?.premium_source === 'store';
  useEffect(() => {
    if (!userId || !storeSubscription) return;
    let cancelled = false;
    void syncSubscription().then((r) => {
      if (r.ok && !cancelled) void fetchProfile(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, storeSubscription, fetchProfile]);

  const signIn = useCallback(async (login: string, password: string): Promise<Result> => {
    if (!supabase) return { error: BACKEND_MISSING };
    setNotice(null);
    let release: () => void = () => {};
    claimGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail(login), password });
      if (error) return { error: friendlyAuthError(error) };
      if (data.session) {
        // Bu telefon hesabın tek oturumu olur; öteki telefonlardaki oturumlar kapatılır
        await claimSession();
        try {
          await supabase.auth.signOut({ scope: 'others' });
        } catch {
          /* öteki oturumlar sunucu kontrolüyle zaten geçersiz */
        }
      }
      return { error: null };
    } catch {
      return { error: 'İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.' };
    } finally {
      claimGate = null;
      release();
    }
  }, []);

  const signUp = useCallback(
    async (fullName: string, username: string, password: string, inviteCode?: string): Promise<SignUpResult> => {
      if (!supabase) return { error: BACKEND_MISSING };
      setNotice(null);
      const deviceId = await getDeviceId();
      // Önce anlaşılır bir uyarı için kontrol (asıl kontrol kayıt anında sunucuda yapılır)
      const check = await checkSignup(username, deviceId);
      if (check.error) return { error: check.error };
      if (check.result && check.result !== 'ok') return { error: SIGNUP_CHECK_TEXT[check.result] };
      let release: () => void = () => {};
      claimGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        const { data, error } = await supabase.auth.signUp({
          email: loginEmail(username),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              username,
              device_id: deviceId,
              ...(inviteCode?.trim() ? { invite_code: inviteCode.trim().toUpperCase() } : {}),
            },
          },
        });
        if (error) return { error: friendlyAuthError(error) };
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          return { error: 'Bu kullanıcı adı alınmış. Başka bir ad dene.' };
        }
        if (!data.session) {
          return {
            error:
              'Hesap oluşturuldu ama giriş açılamadı. (Yönetici: Supabase > Authentication > Email > “Confirm email” kapalı olmalı.)',
          };
        }
        await claimSession();
        return { error: null };
      } catch {
        return { error: 'İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.' };
      } finally {
        claimGate = null;
        release();
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    setPreviewMode(false);
    if (!supabase) return;
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const updateFullName = useCallback(
    async (name: string): Promise<Result> => {
      if (!supabase) return { error: BACKEND_MISSING };
      const { error } = await supabase.rpc('update_my_profile', { p_full_name: name });
      if (error) {
        return {
          error: error.message.includes('invalid_name')
            ? 'Ad 2 ile 60 karakter arasında olmalı.'
            : error.message.includes('reserved_name')
              ? 'Bu ad kullanılamaz. “41. Kat”, “Moderatör” veya “Yönetici” içeren adlar ayrılmıştır.'
              : error.message.includes('name_locked_verified')
                ? 'Doğrulanmış hesabın adı nüfustaki addır; değiştirilemez.'
              : error.message.includes('name_change_used')
                ? 'Gerçek adını değiştirme hakkını kullandın. Yanlışlık varsa bize ulaş.'
                : GENERIC_ERROR,
        };
      }
      await refreshProfile();
      await refreshAccount();
      return { error: null };
    },
    [refreshProfile, refreshAccount],
  );

  const deleteAccount = useCallback(async (confirmText: string): Promise<Result> => {
    if (!supabase) return { error: BACKEND_MISSING };
    // Profil resmi dosyaları da silinir (hesap silindikten sonra oturum kalmadığı için önce silinir; yalnızca onay
    // metni doğruysa)
    const folded = confirmText
      .trim()
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .replace(/ş/g, 's')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ö/g, 'o')
      .replace(/ü/g, 'u');
    if (folded === 'onayliyorum') {
      try {
        const uid = (await supabase.auth.getUser()).data.user?.id;
        if (uid) {
          const { data: files } = await supabase.storage.from('profile-photos').list(uid, { limit: 20 });
          const paths = (files ?? []).map((f) => `${uid}/${f.name}`);
          if (paths.length > 0) await supabase.storage.from('profile-photos').remove(paths);
        }
      } catch {
        // resim silinemese de hesap silme sürer
      }
    }
    const { error } = await supabase.rpc('delete_my_account', { p_confirm: confirmText });
    if (error) {
      return {
        error: error.message.includes('confirm_required')
          ? 'Onay için kutucuğa “onaylıyorum” yaz.'
          : GENERIC_ERROR,
      };
    }
    setNotice('Hesabın ve içeriklerin kalıcı olarak silindi.');
    await supabase.auth.signOut({ scope: 'local' });
    return { error: null };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading: !sessionLoaded || (Boolean(userId) && profileLoading && !profile),
      isLoggedIn: previewMode || (Boolean(session) && Boolean(profile)),
      profile,
      account,
      profileError,
      notice,
      previewMode,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      refreshAccount,
      retryProfile: () => setRetryTick((n) => n + 1),
      updateFullName,
      deleteAccount,
      enterPreview: () => {
        if (__DEV__ && !isBackendReady) setPreviewMode(true);
      },
      leavePreview: () => setPreviewMode(false),
      clearNotice: () => setNotice(null),
    }),
    [
      sessionLoaded,
      userId,
      profileLoading,
      profile,
      account,
      session,
      profileError,
      notice,
      previewMode,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      refreshAccount,
      updateFullName,
      deleteAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı.');
  return ctx;
}
