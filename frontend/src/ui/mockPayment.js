export const MOCK_SUCCESS_CARD = '4242424242424242'
export const MOCK_DECLINED_CARD = '4000000000000002'

export function validateMockCard(fields, now = new Date()) {
  const errors = {}
  const number = fields.number.replace(/\D/g, '')
  if (!fields.name.trim()) errors.name = 'Enter a demo cardholder name.'
  if (![MOCK_SUCCESS_CARD, MOCK_DECLINED_CARD].includes(number)) errors.number = 'Use the demo card 4242 4242 4242 4242. Real cards are not accepted.'
  const match = fields.expiry.match(/^(\d{2})\s*\/\s*(\d{2})$/)
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || 2000 + Number(match[2]) < now.getFullYear() || (2000 + Number(match[2]) === now.getFullYear() && Number(match[1]) < now.getMonth() + 1)) errors.expiry = 'Enter a future expiry date as MM/YY.'
  if (!/^\d{3,4}$/.test(fields.cvc)) errors.cvc = 'Enter a demo CVC of 3 or 4 digits.'
  return errors
}
