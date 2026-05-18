<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'practical_work_id',
    'trainee_id',
    'file_disk',
    'file_path',
    'original_name',
    'mime_type',
    'file_size',
    'submitted_at',
    'score',
    'comment',
    'corrected_at',
])]
class PracticalWorkSubmission extends Model
{
    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'corrected_at' => 'datetime',
            'score' => 'decimal:2',
        ];
    }

    public function practicalWork(): BelongsTo
    {
        return $this->belongsTo(PracticalWork::class);
    }

    public function trainee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'trainee_id');
    }
}
