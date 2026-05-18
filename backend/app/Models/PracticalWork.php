<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'course_id',
    'trainer_id',
    'title',
    'instructions',
    'document_disk',
    'document_path',
    'document_name',
    'document_mime_type',
    'document_size',
    'due_at',
])]
class PracticalWork extends Model
{
    protected function casts(): array
    {
        return [
            'due_at' => 'datetime',
        ];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function trainer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'trainer_id');
    }

    public function submissions(): HasMany
    {
        return $this->hasMany(PracticalWorkSubmission::class)->latest('submitted_at');
    }

    public function hasDocument(): bool
    {
        return filled($this->document_path);
    }
}
