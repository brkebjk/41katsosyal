import type { ReactNode } from 'react';

import type { Notice } from '../ui';
import { AliasCodePage } from './AliasCode';
import { AnnouncementsPage } from './Announcements';
import { ApprovalsPage } from './Approvals';
import { BackupPage } from './Backup';
import { CellNamesPage } from './CellNames';
import { CloseRequestsPage } from './CloseRequests';
import { EventsPage } from './Events';
import { FeedPage } from './Feed';
import { LeadersPage } from './Leaders';
import { LogPage } from './Log';
import { MembersPage } from './Members';
import { ModMessagesPage } from './ModMessages';
import { OverviewPage } from './Overview';
import { PerksPage } from './Perks';
import { ProblemsPage } from './Problems';
import { QuizPage } from './Quiz';
import { ReportsPage } from './Reports';
import { RetentionPage } from './Retention';
import { SettingsPage } from './Settings';
import { TextsPage } from './Texts';
import { TrafficPage } from './Traffic';
import { TreasuresPage } from './Treasures';
import { UiTextsPage } from './UiTexts';
import { VenuesPage } from './Venues';

export type Page =
  | 'overview'
  | 'reports'
  | 'approvals'
  | 'close'
  | 'leaders'
  | 'problems'
  | 'members'
  | 'messages'
  | 'feed'
  | 'announcements'
  | 'events'
  | 'quiz'
  | 'perks'
  | 'cells'
  | 'venues'
  | 'treasures'
  | 'settings'
  | 'texts'
  | 'uitexts'
  | 'alias'
  | 'log'
  | 'traffic'
  | 'retention'
  | 'backup';

/** Menü: konuya göre gruplanmış bölümler */
export const NAV_GROUPS: { title: string; items: { value: Page; label: string }[] }[] = [
  { title: 'Genel', items: [{ value: 'overview', label: 'Özet' }] },
  {
    title: 'Moderasyon',
    items: [
      { value: 'reports', label: 'Şikayetler' },
      { value: 'approvals', label: 'Onaylar' },
      { value: 'close', label: 'Etkinlik kapatma istekleri' },
      { value: 'leaders', label: 'Lider başvuruları' },
      { value: 'problems', label: 'Sorun bildirimleri' },
    ],
  },
  {
    title: 'Üyeler',
    items: [
      { value: 'members', label: 'Üyeler' },
      { value: 'messages', label: 'Üye mesajları' },
    ],
  },
  {
    title: 'İçerik',
    items: [
      { value: 'feed', label: 'Akış' },
      { value: 'announcements', label: 'Duyurular' },
      { value: 'events', label: 'Etkinlikler' },
      { value: 'quiz', label: 'Yarışma soruları' },
      { value: 'perks', label: 'Abone ayrıcalıkları' },
    ],
  },
  {
    title: 'Harita',
    items: [
      { value: 'cells', label: 'Petek adları' },
      { value: 'venues', label: 'Mekânlar' },
      { value: 'treasures', label: 'Hazineler' },
    ],
  },
  {
    title: 'Kayıtlar ve hukuk',
    items: [
      { value: 'log', label: 'İşlem günlüğü' },
      { value: 'traffic', label: 'Trafik kayıtları (5651)' },
      { value: 'retention', label: 'Veri saklama (KVKK)' },
    ],
  },
  {
    title: 'Sistem',
    items: [
      { value: 'settings', label: 'Ayarlar' },
      { value: 'texts', label: 'Uygulama metinleri' },
      { value: 'uitexts', label: 'Yazı düzeltmeleri' },
      { value: 'alias', label: 'Rumuz kodum' },
      { value: 'backup', label: 'Yedekleme' },
    ],
  },
];

export const ALL_PAGES: Page[] = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.value));

export function pageLabel(p: Page): string {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) => i.value === p)?.label ?? '';
}

export type PageProps = {
  onNotice: (n: Notice) => void;
  onMember: (id: string) => void;
  onGo: (p: Page) => void;
  focusMember: string | null;
  clearFocus: () => void;
};

export function renderPage(page: Page, p: PageProps): ReactNode {
  switch (page) {
    case 'overview':
      return <OverviewPage onGo={(x) => p.onGo(x as Page)} />;
    case 'reports':
      return <ReportsPage onNotice={p.onNotice} onMember={p.onMember} />;
    case 'approvals':
      return <ApprovalsPage onNotice={p.onNotice} />;
    case 'close':
      return <CloseRequestsPage onNotice={p.onNotice} />;
    case 'leaders':
      return <LeadersPage onNotice={p.onNotice} onMember={p.onMember} />;
    case 'problems':
      return <ProblemsPage onNotice={p.onNotice} onMember={p.onMember} />;
    case 'members':
      return <MembersPage onNotice={p.onNotice} focusId={p.focusMember} onFocusDone={p.clearFocus} />;
    case 'messages':
      return <ModMessagesPage onNotice={p.onNotice} onMember={p.onMember} />;
    case 'feed':
      return <FeedPage onNotice={p.onNotice} onMember={p.onMember} />;
    case 'announcements':
      return <AnnouncementsPage onNotice={p.onNotice} />;
    case 'events':
      return <EventsPage onNotice={p.onNotice} />;
    case 'quiz':
      return <QuizPage onNotice={p.onNotice} />;
    case 'perks':
      return <PerksPage onNotice={p.onNotice} />;
    case 'cells':
      return <CellNamesPage onNotice={p.onNotice} onMember={p.onMember} />;
    case 'venues':
      return <VenuesPage onNotice={p.onNotice} />;
    case 'treasures':
      return <TreasuresPage onNotice={p.onNotice} />;
    case 'settings':
      return <SettingsPage onNotice={p.onNotice} />;
    case 'texts':
      return <TextsPage onNotice={p.onNotice} />;
    case 'uitexts':
      return <UiTextsPage onNotice={p.onNotice} />;
    case 'alias':
      return <AliasCodePage onNotice={p.onNotice} />;
    case 'log':
      return <LogPage />;
    case 'traffic':
      return <TrafficPage onNotice={p.onNotice} onMember={p.onMember} />;
    case 'retention':
      return <RetentionPage onNotice={p.onNotice} onGo={p.onGo} />;
    case 'backup':
      return <BackupPage onNotice={p.onNotice} />;
  }
}
