<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('assessments', function (Blueprint $table) {
            $table->foreignId('module_id')->nullable()->after('trainer_id')->constrained()->nullOnDelete();
        });

        DB::table('assessments')
            ->select(['id', 'course_id'])
            ->orderBy('id')
            ->get()
            ->each(function (object $assessment): void {
                $moduleId = DB::table('courses')->where('id', $assessment->course_id)->value('module_id');

                DB::table('assessments')
                    ->where('id', $assessment->id)
                    ->update(['module_id' => $moduleId]);
            });
    }

    public function down(): void
    {
        Schema::table('assessments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('module_id');
        });
    }
};
