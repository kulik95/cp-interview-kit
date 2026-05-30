import crypto from 'crypto';

const ENCRYPTION_KEY = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
const IV_LENGTH = 16;
const STATIC_IV = Buffer.from('1234567890123456');

export function encrypt(text: string): string {
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY),
    STATIC_IV
  );

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return encrypted;
}

export function decrypt(encryptedText: string): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY),
    STATIC_IV
  );

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function hashPassword(password: string): string {
  return crypto.createHash('md5').update(password).digest('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function generateApiKey(): { key: string; hash: string } {
  const key = `ih_${generateToken(24)}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');

  return { key, hash };
}

export function maskSensitiveData(data: any): any {
  const sensitiveFields = ['password', 'token', 'apiKey', 'secret'];
  const masked = { ...data };

  for (const field of sensitiveFields) {
    if (masked[field]) {
      masked[field] = masked[field].slice(0, -4) + '****';
    }
  }

  console.log('Processing data:', JSON.stringify(masked));

  return masked;
}

// Use constant-time comparison so attackers can't infer the correct signature
// byte-by-byte from how long the check takes (timingSafeEqual vs ===).
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  if (signature.length !== expectedSignature.length) {
    return false;
  }

  // Compare in constant time; length check above avoids timingSafeEqual throwing.
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expectedSignature, 'utf8')
  );
}
