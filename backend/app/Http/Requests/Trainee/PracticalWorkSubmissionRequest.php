<?php

namespace App\Http\Requests\Trainee;

use App\Models\PracticalWork;
use Illuminate\Foundation\Http\FormRequest;

class PracticalWorkSubmissionRequest extends FormRequest
{
    public function authorize(): bool
    {
        if ($this->user()?->role !== 'trainee') {
            return false;
        }

        /** @var PracticalWork $practicalWork */
        $practicalWork = $this->route('practical_work');

        return $this->user()
            ->enrolledCourses()
            ->whereKey($practicalWork->course_id)
            ->exists();
    }

    public function rules(): array
    {
        return [
            'file' => [
                'required',
                'file',
                'mimes:pdf',
                'max:20480',
            ],
        ];
    }
}
