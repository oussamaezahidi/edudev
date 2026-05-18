<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;

#[Fillable(['name', 'role', 'is_active', 'email', 'phone', 'specialty', 'bio', 'avatar_disk', 'avatar_path', 'avatar_name', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'is_active' => 'boolean',
            'password' => 'hashed',
        ];
    }

    public function modules(): BelongsToMany
    {
        return $this->belongsToMany(Module::class, 'trainer_module', 'trainer_id', 'module_id')
            ->withTimestamps();
    }

    public function courses(): HasMany
    {
        return $this->hasMany(Course::class, 'trainer_id');
    }

    public function practicalWorks(): HasMany
    {
        return $this->hasMany(PracticalWork::class, 'trainer_id');
    }

    public function assessments(): HasMany
    {
        return $this->hasMany(Assessment::class, 'trainer_id');
    }

    public function getAvatarUrlAttribute(): ?string
    {
        return $this->avatar_path ? "/api/profile/avatar/{$this->id}" : null;
    }

    public function enrolledCourses(): BelongsToMany
    {
        return $this->belongsToMany(Course::class, 'course_user')
            ->withPivot('status')
            ->withTimestamps();
    }

    public function apiTokens(): HasMany
    {
        return $this->hasMany(ApiToken::class);
    }

    public function lessons(): HasMany
    {
        return $this->hasMany(Lesson::class, 'trainer_id');
    }

    public function completedLessons(): BelongsToMany
    {
        return $this->belongsToMany(Lesson::class, 'lesson_user')
            ->withPivot('completed', 'completed_at')
            ->withTimestamps();
    }

    public function quizResults(): HasMany
    {
        return $this->hasMany(QuizResult::class);
    }

    public function certificates(): HasMany
    {
        return $this->hasMany(Certificate::class);
    }

    public function practicalWorkSubmissions(): HasMany
    {
        return $this->hasMany(PracticalWorkSubmission::class, 'trainee_id');
    }

}
