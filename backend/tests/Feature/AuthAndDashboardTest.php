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
            'first_name' => 'Stagiaire',
            'last_name' => 'Test',
            'email' => 'stagiaire@test.ma',
            'password' => 'SecurePass123!',
            'password_confirmation' => 'SecurePass123!',
        ]);

        $registerResponse
            ->assertCreated()
            ->assertJsonPath('user.role', 'trainee')
            ->assertJsonStructure(['message', 'redirect_to', 'user']);

        $user = User::query()->where('email', 'stagiaire@test.ma')->firstOrFail();

        // Simulate acting as the trainee for stateless dashboard access
        $this->actingAs($user);

        $this->assertAuthenticatedAs($user);

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

        $loginResponse->assertOk()->assertJsonStructure(['message', 'access_token', 'user']);

        $this->actingAs($admin);

        $this->assertAuthenticatedAs($admin);

        $trainersResponse = $this->getJson('/api/trainers');

        $trainersResponse->assertOk()->assertJsonCount(1);
    }

    public function test_a_trainee_can_register_for_first_year(): void
    {
        $registerResponse = $this->postJson('/api/register', [
            'first_name' => 'Stagiaire',
            'last_name' => '1er Annee',
            'email' => 'stagiaire1@test.ma',
            'password' => 'SecurePass123!',
            'password_confirmation' => 'SecurePass123!',
            'year_level' => '1',
        ]);

        $registerResponse->assertCreated();
        $this->assertDatabaseHas('users', [
            'email' => 'stagiaire1@test.ma',
            'specialty' => 'Développement digital - 1ère année',
        ]);
    }

    public function test_a_trainee_can_register_for_second_year(): void
    {
        $registerResponse = $this->postJson('/api/register', [
            'first_name' => 'Stagiaire',
            'last_name' => '2eme Annee',
            'email' => 'stagiaire2@test.ma',
            'password' => 'SecurePass123!',
            'password_confirmation' => 'SecurePass123!',
            'year_level' => '2',
        ]);

        $registerResponse->assertCreated();
        $this->assertDatabaseHas('users', [
            'email' => 'stagiaire2@test.ma',
            'specialty' => 'Développement digital - 2ème année - Full Stack',
        ]);
    }

    public function test_a_trainee_can_register_for_second_year_with_custom_option(): void
    {
        $registerResponse = $this->postJson('/api/register', [
            'first_name' => 'Stagiaire',
            'last_name' => 'Mobile',
            'email' => 'stagiaire.mobile@test.ma',
            'password' => 'SecurePass123!',
            'password_confirmation' => 'SecurePass123!',
            'year_level' => '2',
            'option' => 'Mobile',
        ]);

        $registerResponse->assertCreated();
        $this->assertDatabaseHas('users', [
            'email' => 'stagiaire.mobile@test.ma',
            'specialty' => 'Développement digital - 2ème année - Mobile',
        ]);
    }

    public function test_a_trainee_can_update_their_entire_profile_information(): void
    {
        $trainee = User::factory()->create([
            'role' => 'trainee',
            'email' => 'stagiaire.profile@test.ma',
            'phone' => '0600000000',
            'specialty' => 'Développement digital - 1ère année',
            'bio' => 'Ancienne bio',
        ]);

        $this->actingAs($trainee);

        $response = $this->postJson('/api/profile', [
            'first_name' => 'Stagiaire',
            'last_name' => 'Profile Updated',
            'email' => 'stagiaire.profile.new@test.ma',
            'phone' => '0611111111',
            'bio' => 'Nouvelle biographie de test',
            'year_level' => '2',
            'option' => 'Mobile',
        ]);

        $response->assertOk();

        $this->assertDatabaseHas('users', [
            'id' => $trainee->id,
            'first_name' => 'Stagiaire',
            'last_name' => 'Profile Updated',
            'email' => 'stagiaire.profile.new@test.ma',
            'phone' => '0611111111',
            'bio' => 'Nouvelle biographie de test',
            'specialty' => 'Développement digital - 2ème année - Mobile',
        ]);
    }
}
