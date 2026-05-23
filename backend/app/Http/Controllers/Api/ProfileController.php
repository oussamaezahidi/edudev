<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $this->serializeUser($request->user()),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:30'],
            'bio' => ['nullable', 'string'],
            'year_level' => ['nullable', 'in:1,2'],
            'option' => ['nullable', 'in:Full Stack,Mobile,RV/RA'],
            'avatar' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096'],
        ]);

        $attributes = [
            'first_name' => trim($data['first_name']),
            'last_name' => trim($data['last_name']),
            'email' => strtolower(trim($data['email'])),
            'phone' => $data['phone'] ?? null,
            'bio' => $data['bio'] ?? null,
        ];

        if (isset($data['year_level']) && $user->role === 'trainee') {
            $year = $data['year_level'];
            if ($year === '2') {
                $optionStr = $data['option'] ?? 'Full Stack';
                $attributes['specialty'] = "Développement digital - 2ème année - {$optionStr}";
            } else {
                $attributes['specialty'] = "Développement digital - 1ère année";
            }
        }

        if ($request->hasFile('avatar')) {
            $this->deleteAvatar($user);
            $file = $request->file('avatar');
            $attributes['avatar_disk'] = 'local';
            $attributes['avatar_path'] = Storage::disk('local')->putFileAs(
                "avatars/{$user->id}",
                $file,
                uniqid('avatar_', true).'.'.$file->extension()
            );
            $attributes['avatar_name'] = $file->getClientOriginalName();
        }

        $user->update($attributes);

        return response()->json([
            'message' => 'Profil mis à jour.',
            'user' => $this->serializeUser($user->fresh()),
        ]);
    }

    public function password(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        abort_unless(Hash::check($data['current_password'], $request->user()->password), 422, 'Le mot de passe actuel est incorrect.');

        $request->user()->update([
            'password' => Hash::make($data['password']),
        ]);

        return response()->json(['message' => 'Mot de passe mis à jour.']);
    }

    public function avatar(Request $request, User $user): \Symfony\Component\HttpFoundation\Response
    {
        abort_unless($request->user() && (int) $request->user()->id === (int) $user->id || $request->user()?->role === 'admin', 403);
        abort_unless($user->avatar_path, 404);

        return Storage::disk($user->avatar_disk ?: 'local')->response($user->avatar_path, $user->avatar_name, [
            'Cache-Control' => 'public, max-age=31536000, immutable'
        ]);
    }

    private function deleteAvatar(User $user): void
    {
        if ($user->avatar_path) {
            Storage::disk($user->avatar_disk ?: 'local')->delete($user->avatar_path);
        }
    }

    private function serializeUser(User $user): array
    {
        return [
            'id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'is_active' => $user->is_active,
            'phone' => $user->phone,
            'specialty' => $user->specialty,
            'bio' => $user->bio,
            'avatar_url' => $user->avatar_url,
        ];
    }
}
