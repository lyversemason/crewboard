import { describe, expect, it } from 'vitest'
import { emailProblem, formatPhone, isValidEmail, isValidPhone } from '../src/engine'

describe('phone numbers', () => {
  it('formats ten digits however they were typed', () => {
    expect(formatPhone('5025999296')).toBe('502-599-9296')
    expect(formatPhone('(502) 599 9296')).toBe('502-599-9296')
    expect(formatPhone('1-502-599-9296')).toBe('502-599-9296')
  })

  it('leaves anything that isn’t a phone number alone, and calls it invalid', () => {
    expect(formatPhone(' 555-55 ')).toBe('555-55')
    expect(isValidPhone('555-55')).toBe(false)
    expect(isValidPhone('555-555-5555')).toBe(true)
  })
})

describe('emails', () => {
  it('accepts normal addresses', () => {
    expect(isValidEmail('candyqueen@gmail.com')).toBe(true)
    expect(isValidEmail('director@cloverpatch.example.com')).toBe(true)
  })

  it('refuses a misspelled ending and says what was probably meant', () => {
    expect(emailProblem('candyqueen@gmail.con')).toBe('Check the spelling: did you mean candyqueen@gmail.com?')
    expect(emailProblem('robin@school.con')).toMatch(/isn’t a real email ending/)
  })

  it('refuses things that aren’t email addresses', () => {
    expect(isValidEmail('candy queen@gmail.com')).toBe(false)
    expect(isValidEmail('candyqueen@gmail')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })
})
