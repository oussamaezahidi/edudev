<?php

namespace App\Http\Requests\Trainer;

use App\Models\PracticalWork;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PracticalWorkRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        if (! $user || ! in_array($user->role, ['admin', 'trainer'], true)) {
            return false;
        }

        /** @var PracticalWork|null $practicalWork */
        $practicalWork = $this->route('practical_work');

        return ! $practicalWork || $user->role === 'admin' || (int) $practicalWork->trainer_id === (int) $user->id;
    }

    public function rules(): array
    {
        $user = $this->user();
        $maxPdfSize = (\App\Models\PlatformSetting::allGrouped()['files']['pdf_max_size'] ?? 20) * 1024; // in kilobytes

        return [
            'course_id' => [
                'required',
                'integer',
                Rule::exists('courses', 'id'),
                function (string $attribute, mixed $value, \Closure $fail) use ($user): void {
                    if ($user?->role === 'trainer' && ! $user->courses()->whereKey($value)->exists()) {
                        $fail('Vous pouvez gérer un TP uniquement pour l’un de vos propres cours.');
                    }
                },
            ],
            'trainer_id' => [
                $user?->role === 'admin' ? 'required' : 'nullable',
                'integer',
                Rule::exists('users', 'id')->where('role', 'trainer'),
            ],
            'title' => ['required', 'string', 'max:255'],
            'instructions' => ['required', 'string'],
            'file' => [
                $this->isMethod('post') ? 'required' : 'nullable',
                'file',
                'mimes:pdf',
                'max:' . $maxPdfSize,
            ],
            'due_at' => ['nullable', 'date'],
        ];
    }
}
