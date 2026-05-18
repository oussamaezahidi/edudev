<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('practical_work_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('practical_work_id')->constrained()->cascadeOnDelete();
            $table->foreignId('trainee_id')->constrained('users')->cascadeOnDelete();
            $table->string('file_disk')->default('local');
            $table->string('file_path');
            $table->string('original_name');
            $table->string('mime_type', 120);
            $table->unsignedBigInteger('file_size');
            $table->timestamp('submitted_at');
            $table->decimal('score', 5, 2)->nullable();
            $table->text('comment')->nullable();
            $table->timestamp('corrected_at')->nullable();
            $table->timestamps();
            $table->unique(['practical_work_id', 'trainee_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practical_work_submissions');
    }
};
