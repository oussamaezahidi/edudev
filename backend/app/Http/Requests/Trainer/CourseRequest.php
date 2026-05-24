<?php

namespace App\Http\Requests\Trainer;

use App\Models\Course;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CourseRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        if (! $user || ! in_array($user->role, ['admin', 'trainer'], true)) {
            return false;
        }

        /** @var Course|null $course */
        $course = $this->route('course');

        return ! $course || $user->role === 'admin' || (int) $course->trainer_id === (int) $user->id;
    }

    public function rules(): array
    {
        $user = $this->user();
        $maxPdfSize = (\App\Models\PlatformSetting::allGrouped()['files']['pdf_max_size'] ?? 20) * 1024; // in kilobytes

        return [
            'module_id' => [
                'required',
                'integer',
                Rule::exists('modules', 'id'),
                function (string $attribute, mixed $value, \Closure $fail) use ($user): void {
                    if ($user?->role === 'trainer' && ! $user->modules()->whereKey($value)->exists()) {
                        $fail("Vous pouvez publier un cours uniquement dans un module qui vous est assigné.");
                    }
                },
            ],
            'trainer_id' => [
                $user?->role === 'admin' ? 'required' : 'nullable',
                'integer',
                Rule::exists('users', 'id')->where('role', 'trainer'),
            ],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'level' => ['required', Rule::in(['beginner', 'intermediate', 'advanced'])],
            'duration_hours' => ['required', 'integer', 'min:1'],
            'file' => [
                $this->isMethod('post') ? 'required' : 'nullable',
                'file',
                'mimes:pdf',
                'max:' . $maxPdfSize,
            ],
        ];
    }
}
