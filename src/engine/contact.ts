// Contact details typed into forms: phone numbers formatted the same way
// everywhere, and emails checked before anything is saved.

/** "5025999296" or "(502) 599 9296" → "502-599-9296". Anything else is returned trimmed. */
export function formatPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (digits.length !== 10) return raw.trim()
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function isValidPhone(phone: string): boolean {
  return /^\d{3}-\d{3}-\d{4}$/.test(formatPhone(phone))
}

/** Misspellings of common email domains, and what was meant. */
const DOMAIN_TYPOS: Record<string, string> = {
  'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.comm': 'gmail.com',
  'yahoo.con': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com',
  'hotmail.con': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com',
  'outlook.con': 'outlook.com', 'outlok.com': 'outlook.com', 'icloud.con': 'icloud.com', 'aol.con': 'aol.com',
}
/** Endings that are almost always a slip of the finger for .com, .net or .org. */
const BAD_ENDINGS = ['con', 'cmo', 'ocm', 'vom', 'xom', 'comm', 'nett', 'ogr', 'orgg']

/** Why an email can't be accepted, or null when it looks right. */
export function emailProblem(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (!email) return 'Enter an email address.'
  if (!/^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email)) return 'Enter an email like name@school.com.'
  const domain = email.split('@')[1]
  if (DOMAIN_TYPOS[domain]) return `Check the spelling: did you mean ${email.split('@')[0]}@${DOMAIN_TYPOS[domain]}?`
  if (BAD_ENDINGS.includes(domain.split('.').at(-1)!)) return `“.${domain.split('.').at(-1)}” isn’t a real email ending. Check the spelling.`
  return null
}

export const isValidEmail = (email: string) => emailProblem(email) === null
