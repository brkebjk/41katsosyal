import { router } from 'expo-router';
import { useRef, useState } from 'react';

import { ActionSheet, type ActionOption, type MenuAnchor } from '@/components/ActionSheet';
import { goToDm } from '@/components/DirectMessages';
import { openDm } from '@/lib/dm';
import { MemberSheet } from '@/components/MemberSheet';
import { confirmAction, notify, notifyReportSent } from '@/lib/dialog';
import { blockAuthor, deleteComment, deletePost, reportContent, REPORT_REASONS } from '@/lib/feed';
import { FRIEND_CONSEQUENCE, FRIEND_WARNING, sendRequestForComment, sendRequestForPost } from '@/lib/friends';
import { revealCommentAuthor, revealPostAuthor, setHidden, type Member } from '@/lib/moderation';

export type ContentTarget = {
  type: 'post' | 'comment';
  id: string;
  alias: string;
  is_mine: boolean;
  is_hidden: boolean;
  /** Yazar zaten arkadaşım mı? (öyleyse "arkadaşlık isteği" seçeneği çıkmaz) */
  is_friend?: boolean;
  /** "Profile git" (haftalık rumuz profili) seçeneği çıksın mı? (mekân, moderatör ve etkinlik paylaşımında yok) */
  profile?: boolean;
  /** Kendi gönderime zincir devamı eklenebilir mi? */
  can_thread?: boolean;
  /** Avatar / rumuz / “...” dokunuş noktası: menü oradan baloncuk gibi açılır */
  anchor?: MenuAnchor;
};

export type ContentResult = 'deleted' | 'hidden' | 'unhidden' | 'blocked' | 'reported' | 'friend';

type Props = {
  target: ContentTarget;
  isModerator: boolean;
  /** Menü kapanınca (işlem yapılsa da yapılmasa da) çağrılır */
  onClose: () => void;
  onDone: (result: ContentResult, message: string) => void;
  onError: (message: string) => void;
  /** Zincire devam ekle (kendi gönderim) */
  onThread?: (postId: string) => void;
  /** Başka ekrana geçmeden önce (ör. açık gönderi penceresini kapatmak için) */
  onNavigate?: () => void;
};

type Step = 'menu' | 'report' | 'member';

/**
 * Bir gönderi ya da yorumun "..." menüsü: sil, şikayet et, yazarı engelle.
 * Moderatörde ek olarak: yazarı göster (kayda geçer) ve gizle / yeniden göster.
 * Bulunduğu ekranın üstüne biner; kapsayıcının `flex: 1` olması gerekir.
 */
export function ContentActions({ target, isModerator, onClose, onDone, onError, onThread, onNavigate }: Props) {
  const [step, setStep] = useState<Step>('menu');
  const [member, setMember] = useState<Member | null>(null);
  const lock = useRef(false);
  const noun = target.type === 'post' ? 'gönderi' : 'yorum';

  /** Tek seferde tek işlem: art arda basışlar ikinci işlem başlatmaz */
  async function guard(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    try {
      await task();
    } finally {
      lock.current = false;
    }
  }

  const onDelete = () =>
    guard(async () => {
      const ok = await confirmAction(
        `${noun === 'gönderi' ? 'Gönderiyi' : 'Yorumu'} sil`,
        'Bu işlem geri alınamaz.',
        'Sil',
        true,
      );
      if (!ok) return;
      const res = target.type === 'post' ? await deletePost(target.id) : await deleteComment(target.id);
      onClose();
      if (res.error) onError(res.error);
      else onDone('deleted', target.type === 'post' ? 'Gönderin silindi.' : 'Yorumun silindi.');
    });

  const onBlock = () =>
    guard(async () => {
      const ok = await confirmAction(
        'Bu kişiyi engelle',
        `${target.alias} rumuzlu kişinin gönderi ve yorumlarını artık görmeyeceksin. Engeli profilinden kaldırabilirsin. Rumuz her hafta değişse de engel sürer.`,
        'Engelle',
        true,
      );
      if (!ok) return;
      const res = await blockAuthor(target.type, target.id);
      onClose();
      if (res.error) onError(res.error);
      else onDone('blocked', 'Kişi engellendi. Artık içeriklerini görmeyeceksin.');
    });

  const onFriendRequest = () =>
    guard(async () => {
      const ok = await confirmAction(
        'Arkadaşlık isteği gönder',
        `İstek ${target.alias} rumuzlu kişiye gidecek. ${FRIEND_CONSEQUENCE}`,
        'İsteği gönder',
        false,
        { icon: 'person-add', tone: 'friend', warning: FRIEND_WARNING },
      );
      if (!ok) return;
      const res = target.type === 'post' ? await sendRequestForPost(target.id) : await sendRequestForComment(target.id);
      onClose();
      if (res.error) {
        onError(res.error);
      } else if (res.outcome === 'accepted') {
        await notify(
          'Artık arkadaşsınız',
          'Karşı taraf da sana istek göndermişti. Birbirinizin gerçek adını artık görebilirsiniz.',
          { icon: 'people', tone: 'success' },
        );
        onDone('friend', 'Arkadaş oldunuz.');
      } else {
        await notify(
          'İstek gönderildi',
          'Karşı taraf kabul edince Profil sekmesindeki Arkadaşlarım bölümünde arkadaş olarak görünür.',
          { icon: 'paper-plane', tone: 'friend' },
        );
      }
    });

  /** Özel mesaj: yazışma açılır ya da (abone) başlatılır; akış ekranında açılır */
  const onMessage = () =>
    guard(async () => {
      const res = await openDm(target.type === 'post' ? { post: target.id } : { comment: target.id });
      onClose();
      if (res.error || !res.id) {
        onError(res.error ?? 'Mesaj açılamadı.');
        return;
      }
      onNavigate?.();
      goToDm(res.id);
    });

  const onReport = (reason: string) =>
    guard(async () => {
      const res = await reportContent(target.type, target.id, reason);
      onClose();
      if (res.error) onError(res.error);
      else await notifyReportSent();
    });

  const onReveal = () =>
    guard(async () => {
      const ok = await confirmAction(
        'Yazarı göster',
        'Yazarın gerçek adı ve hesabı açılır. Bu görüntüleme moderatör kaydına yazılır.',
        'Göster',
      );
      if (!ok) return;
      const res = target.type === 'post' ? await revealPostAuthor(target.id) : await revealCommentAuthor(target.id);
      if (res.error || !res.data) {
        onClose();
        onError(res.error ?? 'Yazar bilgisi alınamadı.');
        return;
      }
      setMember(res.data);
      setStep('member');
    });

  const onToggleHidden = () =>
    guard(async () => {
      const hide = !target.is_hidden;
      const res = await setHidden(target.type, target.id, hide);
      onClose();
      if (res.error) onError(res.error);
      else
        onDone(
          hide ? 'hidden' : 'unhidden',
          hide
            ? `${noun === 'gönderi' ? 'Gönderi' : 'Yorum'} gizlendi.`
            : `${noun === 'gönderi' ? 'Gönderi' : 'Yorum'} yeniden gösteriliyor.`,
        );
    });

  if (step === 'member' && member) {
    return <MemberSheet member={member} onClose={onClose} />;
  }

  if (step === 'report') {
    return (
      <ActionSheet
        title="Şikayet nedeni"
        subtitle="Şikayetin yalnızca moderatörlere gider; şikayet ettiğin kişi bunu bilmez. Konu çözüldüğünde sana bildirim gelecek."
        options={REPORT_REASONS.map((r) => ({
          label: r,
          icon: 'flag-outline' as const,
          onPress: () => void onReport(r),
        }))}
        onClose={onClose}
        anchor={target.anchor}
      />
    );
  }

  const ownOptions: ActionOption[] = target.is_mine
    ? [
        {
          label: target.type === 'post' ? 'Gönderiyi sil' : 'Yorumu sil',
          icon: 'trash-outline',
          destructive: true,
          onPress: () => void onDelete(),
        },
      ]
    : [
        ...(target.is_friend
          ? []
          : [
              {
                label: 'Arkadaşlık isteği gönder',
                icon: 'person-add-outline' as const,
                onPress: () => void onFriendRequest(),
              },
            ]),
        { label: 'Şikayet et', icon: 'flag-outline', onPress: () => setStep('report') },
        {
          label: 'Bu kişiyi engelle',
          icon: 'remove-circle-outline',
          destructive: true,
          onPress: () => void onBlock(),
        },
      ];
  const moderatorOptions: ActionOption[] = isModerator
    ? [
        { label: 'Yazarı göster ve işlem yap', icon: 'eye-outline', onPress: () => void onReveal() },
        {
          label: target.is_hidden ? 'Yeniden göster' : 'Gizle',
          icon: target.is_hidden ? 'eye' : 'eye-off-outline',
          onPress: () => void onToggleHidden(),
        },
      ]
    : [];
  const profileOptions: ActionOption[] = target.profile
    ? [
        {
          label: target.is_mine ? 'Bu haftaki profilime git' : 'Profile git',
          icon: 'person-circle-outline',
          onPress: () => {
            onClose();
            onNavigate?.();
            router.push({
              pathname: '/rumuz',
              params: target.type === 'post' ? { post: target.id } : { comment: target.id },
            });
          },
        },
      ]
    : [];
  const messageOptions: ActionOption[] =
    target.profile && !target.is_mine
      ? [{ label: 'Özel mesaj gönder', icon: 'chatbubbles-outline', onPress: () => void onMessage() }]
      : [];
  const threadOptions: ActionOption[] =
    target.type === 'post' && target.is_mine && target.can_thread && onThread
      ? [
          {
            label: 'Devamını ekle (zincir)',
            icon: 'git-commit-outline',
            onPress: () => {
              onClose();
              onThread(target.id);
            },
          },
        ]
      : [];
  const options: ActionOption[] = [
    ...profileOptions,
    ...messageOptions,
    ...threadOptions,
    ...ownOptions,
    ...moderatorOptions,
  ];

  return (
    <ActionSheet
      title={target.type === 'post' ? 'Gönderi' : 'Yorum'}
      subtitle={target.alias}
      options={options}
      onClose={onClose}
      anchor={target.anchor}
    />
  );
}
