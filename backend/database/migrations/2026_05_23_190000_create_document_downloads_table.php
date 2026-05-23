<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('document_downloads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('downloadable_type');
            $table->unsignedBigInteger('downloadable_id');
            $table->timestamps();

            // Add index for fast querying
            $table->index(['downloadable_type', 'downloadable_id']);
            $table->unique(['user_id', 'downloadable_type', 'downloadable_id'], 'unique_downloads');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('document_downloads');
    }
};
