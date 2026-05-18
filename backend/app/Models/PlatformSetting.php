<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlatformSetting extends Model
{
    protected $fillable = ['group', 'key', 'value'];

    protected function casts(): array
    {
        return [
            'value' => 'array',
        ];
    }

    public static function defaults(): array
    {
        return [
            'general' => [
                'platform_name' => 'EduDev',
                'support_email' => 'support@edudev.local',
                'description' => 'Professional LMS platform for courses, TP and controles.',
                'logo_url' => null,
                'favicon_url' => null,
            ],
            'appearance' => [
                'mode' => 'light',
                'primary_color' => '#ff7900',
                'accent_color' => '#0ea5e9',
                'layout' => 'comfortable',
            ],
            'security' => [
                'session_timeout' => 120,
                'upload_size_limit' => 20,
            ],
            'files' => [
                'pdf_max_size' => 20,
                'allowed_file_types' => ['pdf'],
                'storage_disk' => 'local',
            ],
            'maintenance' => [
                'enabled' => false,
            ],
            'localization' => [
                'language' => 'fr',
                'timezone' => 'Africa/Casablanca',
                'date_format' => 'd/m/Y H:i',
            ],
        ];
    }

    public static function allGrouped(): array
    {
        $settings = self::query()->get()->groupBy('group');
        $payload = self::defaults();

        foreach ($settings as $group => $items) {
            foreach ($items as $item) {
                $payload[$group][$item->key] = $item->value['data'] ?? null;
            }
        }

        return $payload;
    }

    public static function putGrouped(array $groups): array
    {
        foreach ($groups as $group => $values) {
            foreach ($values as $key => $value) {
                self::query()->updateOrCreate(
                    ['group' => $group, 'key' => $key],
                    ['value' => ['data' => $value]]
                );
            }
        }

        return self::allGrouped();
    }
}
