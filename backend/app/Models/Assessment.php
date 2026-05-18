<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'module_id',
    'course_id',
    'trainer_id',
    'title',
    'format',
    'document_disk',
    'document_path',
    'document_name',
    'document_mime_type',
    'document_size',
    'scheduled_at',
    'duration_minutes',
    'total_points',
])]
class Assessment extends Model
{
    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
        ];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function module(): BelongsTo
    {
        return $this->belongsTo(Module::class);
    }

    public function trainer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'trainer_id');
    }

    public function hasDocument(): bool
    {
        return filled($this->document_path);
    }
}
