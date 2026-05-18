<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthAndDashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_trainee_can_register_and_access_their_dashboard(): void
    {
        $registerResponse = $this->postJson('/api/register', [
            'name' => 'Stagiaire Test',
            'email' => 'stagiaire@test.ma',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $registerResponse
            ->assertCreated()
            ->assertJsonPath('user.role', 'trainee')
            ->assertJsonStructure(['message', 'redirect_to', 'user']);

        $this->assertAuthenticated();

        $dashboardResponse = $this->getJson('/api/dashboard');

        $dashboardResponse
            ->assertOk()
            ->assertJsonPath('role', 'trainee');
    }

    public function test_an_admin_can_login_and_list_trainers(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'email' => 'admin@test.ma',
            'password' => Hash::make('password'),
        ]);

        Module::query()->create([
            'title' => 'Laravel',
            'slug' => 'laravel',
        ]);

        User::factory()->create([
            'role' => 'trainer',
            'email' => 'trainer@test.ma',
        ]);

        $loginResponse = $this->postJson('/api/login', [
            'email' => $admin->email,
            'password' => 'password',
        ]);

        $loginResponse->assertOk()->assertJsonStructure(['message', 'redirect_to', 'user']);

        $this->assertAuthenticatedAs($admin);

        $trainersResponse = $this->getJson('/api/trainers');

        $trainersResponse->assertOk()->assertJsonCount(1);
    }
}
