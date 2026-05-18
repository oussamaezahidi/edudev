<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['quiz_id', 'prompt', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer'])]
class Question extends Model
{
    public function quiz(): BelongsTo
    {
        return $this->belongsTo(Quiz::class);
    }
}
