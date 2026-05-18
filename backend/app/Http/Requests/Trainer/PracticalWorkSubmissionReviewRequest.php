<?php

namespace App\Http\Requests\Trainer;

use Illuminate\Foundation\Http\FormRequest;

class PracticalWorkSubmissionReviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'trainer';
    }

    public function rules(): array
    {
        return [
            'score' => ['nullable', 'numeric', 'min:0', 'max:20'],
            'comment' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
