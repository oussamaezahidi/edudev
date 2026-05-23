<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PlatformSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class AdminSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json([
            'settings' => PlatformSetting::allGrouped(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'general.platform_name' => ['required', 'string', 'max:120'],
            'general.support_email' => ['required', 'email', 'max:255'],
            'appearance.mode' => ['required', 'in:light,dark,system'],
            'appearance.primary_color' => ['required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'files.pdf_max_size' => ['required', 'integer', 'min:1', 'max:100'],
            'maintenance.enabled' => ['required', 'boolean'],
        ]);

        $appearance = $data['appearance'];
        if (($appearance['mode'] ?? 'light') === 'system') {
            $appearance['mode'] = 'light';
        }

        $settings = PlatformSetting::putGrouped([
            'general' => $data['general'],
            'appearance' => $appearance,
            'files' => [
                'pdf_max_size' => $data['files']['pdf_max_size'],
                'allowed_file_types' => ['pdf'],
                'storage_disk' => 'local',
            ],
            'maintenance' => $data['maintenance'],
        ]);

        return response()->json([
            'message' => 'Paramètres mis à jour.',
            'settings' => $settings,
        ]);
    }

    public function uploadAsset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:logo,favicon'],
            'asset' => ['required', 'image', 'mimes:png,jpg,jpeg,webp,ico', 'max:2048'],
        ]);

        $file = $request->file('asset');
        $path = $file->storeAs('platform', $data['type'].'-'.uniqid().'.'.$file->extension(), 'public');
        $url = Storage::disk('public')->url($path);
        $key = $data['type'] === 'logo' ? 'logo_url' : 'favicon_url';

        PlatformSetting::putGrouped([
            'general' => [$key => $url],
        ]);

        return response()->json([
            'message' => $data['type'] === 'logo' ? 'Logo mis à jour.' : 'Favicon mis à jour.',
            'url' => $url,
            'settings' => PlatformSetting::allGrouped(),
        ]);
    }

    public function action(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:clear_cache,optimize,maintenance_on,maintenance_off,force_logout'],
        ]);

        match ($data['action']) {
            'clear_cache' => $this->callArtisan(['cache:clear', 'config:clear', 'route:clear', 'view:clear']),
            'optimize' => $this->callArtisan(['optimize:clear', 'optimize']),
            'maintenance_on', 'maintenance_off' => null,
            'force_logout' => $this->forceLogout($request),
        };

        if ($data['action'] === 'maintenance_on' || $data['action'] === 'maintenance_off') {
            PlatformSetting::putGrouped([
                'maintenance' => ['enabled' => $data['action'] === 'maintenance_on'],
            ]);
        }

        return response()->json([
            'message' => 'Action exécutée.',
            'settings' => PlatformSetting::allGrouped(),
        ]);
    }

    private function callArtisan(array $commands): void
    {
        foreach ($commands as $command) {
            Artisan::call($command);
        }
    }

    private function forceLogout(Request $request): void
    {
        if (config('session.driver') === 'database') {
            $sessionId = $request->hasSession() ? $request->session()->getId() : null;
            DB::table(config('session.table', 'sessions'))
                ->when($sessionId, fn ($query, string $id) => $query->where('id', '!=', $id))
                ->delete();
        }

        // Revoke all stateless API refresh tokens globally (except the current admin's if authenticated)
        $user = $request->user();
        \App\Models\ApiToken::query()
            ->when($user, fn ($query) => $query->where('user_id', '!=', $user->id))
            ->delete();
    }
}
