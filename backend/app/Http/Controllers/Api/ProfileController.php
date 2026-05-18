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
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'avatar' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096'],
        ]);

        $attributes = [
            'name' => trim($data['name']),
            'email' => strtolower(trim($data['email'])),
        ];

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

    public function avatar(Request $request, User $user): StreamedResponse
    {
        abort_unless($request->user() && (int) $request->user()->id === (int) $user->id || $request->user()?->role === 'admin', 403);
        abort_unless($user->avatar_path, 404);

        return Storage::disk($user->avatar_disk ?: 'local')->response($user->avatar_path, $user->avatar_name);
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
