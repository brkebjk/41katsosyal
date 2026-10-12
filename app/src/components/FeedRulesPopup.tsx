import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Popup } from '@/components/Popup';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, fonts, radii, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const RULES: { icon: IconName; title: string; text: string; strong?: boolean }[] = [
  {
    icon: 'finger-print',
    title: 'Anonimlik sınırsız değildir',
    strong: true,
    text:
      'Akışta rumuzunla görünürsün; ancak her rumuz, sunucularımızda kayıtlı hesabınla (gerçek adın, hesap bilgilerin, ' +
      'cihaz ve işlem kayıtların) bağlantılı olarak saklanır. Mahkeme kararı, savcılık talebi ya da başka bir resmi ' +
      'kurumun yasal talebi olduğunda bu bilgiler kolluk kuvvetlerine veya ilgili makama teslim edilir. Rumuzun ' +
      'arkasına saklanarak suç işlenemez.',
  },
  {
    icon: 'calendar',
    title: 'Haftalık akış',
    text:
      'Rumuzun, genel akış, petek akışları ve rumuz profilleri her Pazartesi 00:00’da (Türkiye saati) sıfırlanır. ' +
      'Eski gönderiler kimseye görünmez ama yasal yükümlülük gereği 1 yıl arşivde saklanır; resmi talep olursa ' +
      'yetkili makamlara verilebilir. 1 yıl sonunda silinir.',
  },
  {
    icon: 'heart',
    title: 'Saygı ve nezaket',
    text:
      'Hakaret, küfür, aşağılama ve kişileri küçük düşürmek yasaktır. Irk, etnik köken, din, dil, cinsiyet, cinsel ' +
      'yönelim, engellilik ya da görünüş üzerinden nefret söylemi ve ayrımcılık kabul edilmez.',
  },
  {
    icon: 'hand-left',
    title: 'Taciz, tehdit ve zorbalık',
    text:
      'Bir kişiyi ısrarla rahatsız etmek, tehdit etmek, şantaj yapmak, takip etmek, hedef göstermek ya da başkalarını ' +
      'birine karşı kışkırtmak yasaktır.',
  },
  {
    icon: 'warning',
    title: 'Cinsel içerik, taciz ve istismar',
    strong: true,
    text:
      'Müstehcen ya da cinsel içerik paylaşmak ve cinsel taciz kesinlikle yasaktır. Çocukların istismarına yönelik ' +
      'her türlü içerik, ima ya da girişim hiçbir şekilde hoş görülmez; hesap derhal kapatılır ve durum yetkili ' +
      'makamlara bildirilir.',
  },
  {
    icon: 'cash',
    title: 'Dolandırıcılık',
    strong: true,
    text:
      'Sahte ilan, sahte çekiliş ya da kampanya, para, kripto para veya hediye kartı istemek; şifre, kart, IBAN, ' +
      'doğrulama kodu gibi bilgileri sormak dolandırıcılıktır ve yasaktır. Kimseye para gönderme, hiçbir kodu ve ' +
      'kişisel bilgini paylaşma. Moderatörler senden asla şifre ya da ödeme istemez.',
  },
  {
    icon: 'id-card',
    title: 'Kişisel bilgiler',
    text:
      'Başkasının adını, telefonunu, adresini, iş yerini ya da fotoğrafını izni olmadan paylaşmak yasaktır. Kendi ' +
      'bilgilerini paylaşırken de dikkatli ol.',
  },
  {
    icon: 'ban',
    title: 'Yasa dışı içerik',
    text:
      'Uyuşturucu, silah, yasa dışı bahis ve kumar, sahte belge ya da şiddete teşvik içeren paylaşımlar yasaktır ve ' +
      'gerektiğinde yetkili makamlara bildirilir.',
  },
  {
    icon: 'megaphone',
    title: 'Spam ve reklam',
    text: 'Aynı mesajı tekrar tekrar yazmak, izinsiz reklam ve yönlendirme bağlantıları paylaşmak yasaktır.',
  },
  {
    icon: 'people',
    title: 'Yüz yüze buluşmalar',
    text:
      'Tanımadığın kişilerle kalabalık ve herkese açık yerlerde buluş, bir yakınına nerede olduğunu haber ver. ' +
      'Kendini güvende hissetmediğin anda buluşmayı bitir.',
  },
  {
    icon: 'shield-checkmark',
    title: 'Yaptırımlar',
    text:
      'Kurallara uymayan içerikler gizlenir ya da silinir. Hesap geçici olarak susturulabilir ya da kalıcı olarak ' +
      'kapatılabilir. Suç oluşturabilecek durumlar yetkili makamlara iletilir.',
  },
  {
    icon: 'flag',
    title: 'Bildir',
    text:
      'Kurallara aykırı bir paylaşım görürsen gönderinin “…” menüsünden şikayet et. Şikayetin yalnızca moderatörlere ' +
      'gider. Acil bir tehlike varsa beklemeden 112’yi ara.',
  },
];

/** Önemli kurallar: kısa tablo (kural → sonucu) */
const KEY_TABLE: { rule: string; result: string }[] = [
  { rule: 'Cinsel içerik, çocuk istismarı', result: 'Hesap kapanır, makamlara bildirilir' },
  { rule: 'Dolandırıcılık, para / kod isteme', result: 'Hesap kapanır' },
  { rule: 'Tehdit, taciz, şantaj', result: 'Susturma ya da kapatma; makamlara iletilir' },
  { rule: 'Hakaret, nefret söylemi', result: 'İçerik silinir, susturma' },
  { rule: 'Başkasının kişisel bilgisi', result: 'İçerik silinir, susturma' },
  { rule: 'Suç (rumuzla da olsa)', result: 'Resmi talepte kimlik bilgileri teslim edilir' },
];

/** Akış: topluluk ve yazışma kuralları. Üstte önemli kurallar tablosu, altta dokununca açılan başlıklar. */
export function FeedRulesPopup({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Popup
      title="Topluluk ve Yazışma Kuralları"
      subtitle="41. Kat Sosyal'de herkesin güvende ve rahat yazışması için"
      icon="document-text"
      onClose={onClose}
      testID="feed-rules"
      footer={<PrimaryButton label="Okudum, anladım" onPress={onClose} />}
    >
      <Text style={styles.section}>Önemli kurallar</Text>
      <View style={styles.table} accessibilityRole="list">
        <View style={[styles.tr, styles.th]}>
          <Text style={[styles.td, styles.thText]}>Yasak</Text>
          <Text style={[styles.td, styles.thText]}>Sonucu</Text>
        </View>
        {KEY_TABLE.map((r, i) => (
          <View key={r.rule} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
            <Text style={[styles.td, styles.tdRule]}>{r.rule}</Text>
            <Text style={[styles.td, styles.tdResult]}>{r.result}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.section}>Tüm kurallar · ayrıntı için dokun</Text>
      {RULES.map((r) => {
        const isOpen = open === r.title;
        return (
          <Pressable
            key={r.title}
            onPress={() => setOpen(isOpen ? null : r.title)}
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
            style={[styles.item, r.strong && styles.itemStrong]}
          >
            <View style={styles.head}>
              <Ionicons name={r.icon} size={16} color={r.strong ? colors.alert : colors.primary} />
              <Text style={[styles.title, r.strong && styles.titleStrong]}>{r.title}</Text>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
            </View>
            {isOpen ? <Text style={styles.text}>{r.text}</Text> : null}
          </Pressable>
        );
      })}
      <Text style={styles.foot}>
        Uygulamayı kullanarak bu kurallara ve Kullanıcı Sözleşmesi’ne uymayı kabul etmiş olursun.
      </Text>
    </Popup>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.text, fontFamily: fonts.black, fontSize: 13, marginTop: 2 },
  table: { borderRadius: radii.md, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 92, 92, 0.45)' },
  tr: { flexDirection: 'row' },
  th: { backgroundColor: 'rgba(255, 92, 92, 0.18)' },
  trAlt: { backgroundColor: colors.surfaceAlt },
  td: { flex: 1, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, lineHeight: 16 },
  thText: { color: colors.alert, fontFamily: fonts.black },
  tdRule: { color: colors.text, fontFamily: fonts.semi },
  tdResult: { color: colors.textMuted },
  item: {
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  itemStrong: { borderWidth: 1, borderColor: 'rgba(255, 92, 92, 0.45)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: 14 },
  titleStrong: { color: colors.alert },
  text: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  foot: { color: colors.textMuted, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 2 },
});
