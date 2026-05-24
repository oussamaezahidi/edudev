<?php

namespace App\Http\Requests\Trainer;

use App\Models\Assessment;
use App\Models\Course;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class AssessmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        if (! $user || ! in_array($user->role, ['admin', 'trainer'], true)) {
            return false;
        }

        /** @var Assessment|null $assessment */
        $assessment = $this->route('assessment');

        return ! $assessment || $user->role === 'admin' || (int) $assessment->trainer_id === (int) $user->id;
    }

    public function rules(): array
    {
        $user = $this->user();
        $maxPdfSize = (\App\Models\PlatformSetting::allGrouped()['files']['pdf_max_size'] ?? 20) * 1024; // in kilobytes

        return [
            'module_id' => [
                'nullable',
                'integer',
                Rule::exists('modules', 'id'),
                function (string $attribute, mixed $value, \Closure $fail) use ($user): void {
                    if ($value && $user?->role === 'trainer' && ! $user->modules()->whereKey($value)->exists()) {
                        $fail("Vous pouvez associer un contrôle uniquement à un module qui vous est assigné.");
                    }
                },
            ],
            'course_id' => [
                'nullable',
                'integer',
                Rule::exists('courses', 'id'),
                function (string $attribute, mixed $value, \Closure $fail) use ($user): void {
                    if ($value && $user?->role === 'trainer' && ! $user->courses()->whereKey($value)->exists()) {
                        $fail('Vous pouvez associer un contrôle uniquement à l’un de vos propres cours.');
                    }
                },
            ],
            'trainer_id' => [
                $user?->role === 'admin' ? 'required' : 'nullable',
                'integer',
                Rule::exists('users', 'id')->where('role', 'trainer'),
            ],
            'title' => ['required', 'string', 'max:255'],
            'format' => ['required', Rule::in(['quiz', 'exam', 'project_review'])],
            'file' => [
                $this->isMethod('post') ? 'required' : 'nullable',
                'file',
                'mimes:pdf',
                'max:' . $maxPdfSize,
            ],
            'scheduled_at' => ['nullable', 'date'],
            'duration_minutes' => ['required', 'integer', 'min:1'],
            'total_points' => ['required', 'integer', 'min:1'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $courseId = $this->integer('course_id');
                $moduleId = $this->integer('module_id');

                if ($courseId && $moduleId) {
                    $course = Course::query()->select('id', 'module_id')->find($courseId);

                    if ($course && (int) $course->module_id !== $moduleId) {
                        $validator->errors()->add('module_id', 'Le module sélectionné ne correspond pas au cours choisi.');
                    }
                }

                if (! $courseId && ! $moduleId) {
                    $validator->errors()->add('module_id', 'Veuillez sélectionner au moins un module.');
                }
            },
        ];
    }
}
