<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('avatar_disk')->nullable()->after('bio');
            $table->string('avatar_path')->nullable()->after('avatar_disk');
            $table->string('avatar_name')->nullable()->after('avatar_path');
        });

        Schema::table('practical_works', function (Blueprint $table): void {
            $table->string('document_disk')->nullable()->after('instructions');
            $table->string('document_path')->nullable()->after('document_disk');
            $table->string('document_name')->nullable()->after('document_path');
            $table->string('document_mime_type')->nullable()->after('document_name');
            $table->unsignedBigInteger('document_size')->nullable()->after('document_mime_type');
        });

        Schema::table('assessments', function (Blueprint $table): void {
            $table->string('document_disk')->nullable()->after('format');
            $table->string('document_path')->nullable()->after('document_disk');
            $table->string('document_name')->nullable()->after('document_path');
            $table->string('document_mime_type')->nullable()->after('document_name');
            $table->unsignedBigInteger('document_size')->nullable()->after('document_mime_type');
        });
    }

    public function down(): void
    {
        Schema::table('assessments', function (Blueprint $table): void {
            $table->dropColumn(['document_disk', 'document_path', 'document_name', 'document_mime_type', 'document_size']);
        });

        Schema::table('practical_works', function (Blueprint $table): void {
            $table->dropColumn(['document_disk', 'document_path', 'document_name', 'document_mime_type', 'document_size']);
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['avatar_disk', 'avatar_path', 'avatar_name']);
        });
    }
};
