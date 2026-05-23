<?php

namespace App\Services;

use Exception;

class JWTService
{
    /**
     * Generate a signed JWT token.
     *
     * @param array $payload
     * @param int $lifetimeSeconds
     * @return string
     */
    public static function generate(array $payload, int $lifetimeSeconds = 900): string
    {
        $secret = config('jwt.secret') ?: config('app.key');
        
        $header = [
            'alg' => 'HS256',
            'typ' => 'JWT',
        ];

        $payload['iat'] = time();
        $payload['nbf'] = time();
        $payload['exp'] = time() + $lifetimeSeconds;

        $headerEncoded = self::base64UrlEncode(json_encode($header));
        $payloadEncoded = self::base64UrlEncode(json_encode($payload));

        $signature = hash_hmac('sha256', "{$headerEncoded}.{$payloadEncoded}", $secret, true);
        $signatureEncoded = self::base64UrlEncode($signature);

        return "{$headerEncoded}.{$payloadEncoded}.{$signatureEncoded}";
    }

    /**
     * Decode and validate a JWT token.
     *
     * @param string $token
     * @return array
     * @throws Exception
     */
    public static function decode(string $token): array
    {
        $secret = config('jwt.secret') ?: config('app.key');
        $parts = explode('.', $token);

        if (count($parts) !== 3) {
            throw new Exception('Jeton JWT malformé.');
        }

        [$headerEncoded, $payloadEncoded, $signatureEncoded] = $parts;

        // Verify signature
        $signature = self::base64UrlDecode($signatureEncoded);
        $expectedSignature = hash_hmac('sha256', "{$headerEncoded}.{$payloadEncoded}", $secret, true);

        if (!hash_equals($signature, $expectedSignature)) {
            throw new Exception('Signature du jeton invalide.');
        }

        $payload = json_decode(self::base64UrlDecode($payloadEncoded), true);

        if (!$payload) {
            throw new Exception('Contenu du jeton invalide.');
        }

        // Validate expiration
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            throw new Exception('Le jeton a expiré.');
        }

        // Validate not before
        if (isset($payload['nbf']) && $payload['nbf'] > time()) {
            throw new Exception('Le jeton n\'est pas encore actif.');
        }

        return $payload;
    }

    /**
     * Encode string to base64url.
     */
    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * Decode base64url string.
     */
    private static function base64UrlDecode(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/'));
    }
}
