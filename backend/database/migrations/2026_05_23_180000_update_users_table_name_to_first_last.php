<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('first_name')->nullable()->after('id');
            $table->string('last_name')->nullable()->after('first_name');
        });

        // Migrate existing names
        $users = DB::table('users')->get();
        foreach ($users as $user) {
            $parts = explode(' ', $user->name, 2);
            $firstName = $parts[0] ?? 'Prénom';
            $lastName = $parts[1] ?? 'Nom';
            DB::table('users')->where('id', $user->id)->update([
                'first_name' => $firstName,
                'last_name' => $lastName,
            ]);
        }

        Schema::table('users', function (Blueprint $table) {
            $table->string('first_name')->nullable(false)->change();
            $table->string('last_name')->nullable(false)->change();
            $table->dropColumn('name');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('name')->nullable()->after('last_name');
        });

        $users = DB::table('users')->get();
        foreach ($users as $user) {
            DB::table('users')->where('id', $user->id)->update([
                'name' => trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')),
            ]);
        }

        Schema::table('users', function (Blueprint $table) {
            $table->string('name')->nullable(false)->change();
            $table->dropColumn(['first_name', 'last_name']);
        });
    }
};
