// Backend'dagi TextChoices bilan bir xil bo'lishi kerak.
export const L = {
  role: { admin: 'Administrator', manager: 'Loyiha menejeri', specialist: 'Mutaxassis', accountant: 'Buxgalter' },
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
  taskStatus: { todo: 'Bajarilishi kerak', in_progress: 'Jarayonda', review: 'Tekshiruvda', done: 'Bajarildi' },
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
    idea: "G'oya", in_work: 'Tayyorlanmoqda', review: "Mijoz tasdig'ida", approved: 'Tasdiqlangan', published: "E'lon qilingan",
  },
} as const

export const money = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '—'
    : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(v)) + " so'm"

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
}
