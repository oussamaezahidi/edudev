<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            $table->string('document_disk')->nullable()->after('duration_hours');
            $table->string('document_path')->nullable()->after('document_disk');
            $table->string('document_name')->nullable()->after('document_path');
            $table->string('document_mime_type')->nullable()->after('document_name');
            $table->unsignedBigInteger('document_size')->nullable()->after('document_mime_type');
        });
    }

    public function down(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            $table->dropColumn([
                'document_disk',
                'document_path',
                'document_name',
                'document_mime_type',
                'document_size',
            ]);
        });
    }
};
