// Backend'dagi TextChoices bilan bir xil bo'lishi kerak.
export const L = {
  role: {
    admin: 'Administrator (to\'liq huquq)', manager: 'Loyiha menejeri', specialist: 'Mutaxassis',
    accountant: 'Buxgalter', sales: 'Sotuv (B2B)', hr: 'HR',
  },
  job: {
    ceo: 'CEO / Direktor', pm: 'Project manager', smm: 'SMM manager', operator: 'Video operator',
    editor: 'Videomontajor', designer: 'Grafik dizayner', copywriter: 'Kopirayter', target: 'Targetolog',
    b2b: 'B2B manager', hr: 'HR manager', accountant: 'Buxgalter', other: 'Boshqa',
  },
  clientStatus: { active: 'Faol', paused: "To'xtatilgan", archived: 'Arxiv' },
  leadStage: {
    new: 'Yangi', contacted: "Bog'lanildi", proposal: 'Taklif yuborildi',
    negotiation: 'Muzokara', won: 'Yutildi', lost: "Yo'qotildi",
  },
  leadSource: {
    instagram: 'Instagram', telegram: 'Telegram', website: 'Veb-sayt',
    referral: 'Tavsiya', call: "Qo'ng'iroq", other: 'Boshqa',
  },
  contractStatus: { draft: 'Qoralama', active: 'Amalda', finished: 'Tugagan', cancelled: 'Bekor qilingan' },
  service: {
    smm: 'SMM', target: 'Target reklama', context: 'Kontekst reklama', seo: 'SEO',
    branding: 'Brending / dizayn', website: 'Veb-sayt', video: 'Video ishlab chiqarish', other: 'Boshqa',
  },
  projectStatus: {
    planning: 'Rejalashtirilmoqda', active: 'Jarayonda', on_hold: "To'xtatilgan",
    completed: 'Yakunlangan', cancelled: 'Bekor qilingan',
  },
  taskStatus: { todo: 'Rejada', in_progress: 'Jarayonda', review: 'Tasdiqda', done: 'Tayyor' },
  priority: { low: 'Past', medium: "O'rta", high: 'Yuqori', urgent: 'Shoshilinch' },
  invoiceStatus: {
    draft: 'Qoralama', sent: 'Yuborilgan', partial: "Qisman to'langan", paid: "To'langan", cancelled: 'Bekor qilingan',
  },
  paymentMethod: { cash: 'Naqd', card: 'Karta', transfer: "Bank o'tkazmasi", other: 'Boshqa' },
  expenseCategory: {
    salary: 'Maosh', ads: 'Reklama (mijoz byudjeti)', freelancer: 'Frilanser', software: 'Dasturlar / obunalar',
    office: 'Ofis / ijara', equipment: 'Jihozlar', tax: 'Soliq', other: 'Boshqa',
  },
  adPlatform: {
    meta: 'Meta (Instagram/Facebook)', google: 'Google Ads', yandex: 'Yandex Direct',
    telegram: 'Telegram Ads', tiktok: 'TikTok Ads', other: 'Boshqa',
  },
  postPlatform: {
    instagram: 'Instagram', telegram: 'Telegram', facebook: 'Facebook',
    tiktok: 'TikTok', youtube: 'YouTube', other: 'Boshqa',
  },
  postType: {
    post: 'Post', carousel: 'Karusel', story: 'Stories', reels: 'Reels / qisqa video', video: 'Video', article: 'Maqola',
  },
  postStatus: {
    idea: "G'oya", script: 'Ssenariy', shoot: 'Syomka', edit: 'Montaj', design: 'Dizayn', review: 'Tasdiq',
    ready: 'Nashrga tayyor', published: 'Nashr qilindi',
  },
  reportStatus: { draft: 'Qoralama', ready: 'Tayyor', sent: 'Yuborilgan' },
} as const

export const money = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '—'
    : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(v)) + " so'm"

const WEEKDAYS_UZ = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']
const MONTHS_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']

/** "Juma, 16-oktabr" — brauzerlarda o'zbek lokali yo'qligi uchun qo'lda. */
export const longDateUz = (d = new Date()) => `${WEEKDAYS_UZ[d.getDay()]}, ${d.getDate()}-${MONTHS_UZ[d.getMonth()]}`

/** Muddatni odam tilida: "Bugun", "Ertaga", "2 kun kechikdi", "Payshanba", "24-okt". */
export const relDay = (iso?: string | null): { text: string; tone: string } => {
  if (!iso) return { text: 'Muddatsiz', tone: 'muted' }
  const d = new Date(iso + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (diff < -1) return { text: `${-diff} kun kechikdi`, tone: 'text-bad' }
  if (diff === -1) return { text: 'Kecha', tone: 'text-bad' }
  if (diff === 0) return { text: 'Bugun', tone: 'text-warn' }
  if (diff === 1) return { text: 'Ertaga', tone: '' }
  if (diff < 7) return { text: WEEKDAYS_UZ[d.getDay()], tone: 'muted' }
  return { text: `${d.getDate()}-${MONTHS_UZ[d.getMonth()].slice(0, 3)}`, tone: 'muted' }
}

export const num = (v: unknown) => new Intl.NumberFormat('ru-RU').format(Number(v ?? 0))

export const fmtDate = (v?: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  return d.toLocaleDateString('ru-RU')
}

export const fmtDateTime = (v?: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

export const todayISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Holatlar uchun badge rangi (status tokenlari). */
export const tone: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'muted'> = {
  active: 'good', paid: 'good', done: 'good', won: 'good', published: 'good', approved: 'good', completed: 'good',
  partial: 'warn', review: 'warn', in_progress: 'info', in_work: 'info', sent: 'info', negotiation: 'warn',
  proposal: 'info', contacted: 'info', planning: 'info',
  lost: 'bad', cancelled: 'bad', urgent: 'bad', high: 'warn',
  paused: 'muted', archived: 'muted', draft: 'muted', on_hold: 'muted', finished: 'muted', idea: 'muted',
  todo: 'muted', new: 'info', low: 'muted', medium: 'info',
  script: 'info', shoot: 'warn', edit: 'warn', design: 'info', ready: 'good',
}
