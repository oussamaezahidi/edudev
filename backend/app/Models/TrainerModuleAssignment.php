<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['trainer_id', 'module_id', 'assigned_by', 'action', 'assigned_at'])]
class TrainerModuleAssignment extends Model
{
    protected function casts(): array
    {
        return [
            'assigned_at' => 'datetime',
        ];
    }

    public function trainer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'trainer_id');
    }

    public function module(): BelongsTo
    {
        return $this->belongsTo(Module::class);
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }
}
