<?php

use App\Http\Controllers\Api\AssessmentController;
use App\Http\Controllers\Api\AdminSettingsController;
use App\Http\Controllers\Api\AdminModuleAssignmentController;
use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\CertificateController;
use App\Http\Controllers\Api\CourseController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\EnrollmentController;
use App\Http\Controllers\Api\LessonController;
use App\Http\Controllers\Api\ModuleController;
use App\Http\Controllers\Api\PracticalWorkController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\QuizController;
use App\Http\Controllers\Api\TraineeController;
use App\Http\Controllers\Api\TraineeWorkspaceController;
use App\Http\Controllers\Api\TrainerController;
use App\Http\Controllers\Api\TrainerModuleController;
use Illuminate\Support\Facades\Route;

Route::get('/catalog/courses', [CatalogController::class, 'index']);
Route::get('/catalog/courses/{course}', [CatalogController::class, 'show']);
Route::get('/settings', [AdminSettingsController::class, 'show']);

Route::middleware('web')->group(function (): void {
    Route::get('/csrf-token', [AuthController::class, 'csrfToken']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware(['auth', 'active'])->group(function (): void {
        Route::get('/dashboard', DashboardController::class);
        Route::get('/profile', [ProfileController::class, 'show']);
        Route::post('/profile', [ProfileController::class, 'update']);
        Route::put('/profile/password', [ProfileController::class, 'password']);
        Route::get('/profile/avatar/{user}', [ProfileController::class, 'avatar']);
        Route::get('/courses', [CourseController::class, 'index'])->middleware('role:admin,trainer,trainee');
        Route::get('/courses/{course}', [CourseController::class, 'show'])->middleware('role:admin,trainer,trainee');
        Route::get('/courses/{course}/preview', [CourseController::class, 'preview'])->middleware('role:admin,trainer,trainee');
        Route::get('/courses/{course}/download', [CourseController::class, 'download'])->middleware('role:admin,trainer,trainee');
        Route::get('/practical-works/{practical_work}/preview', [PracticalWorkController::class, 'preview'])->middleware('role:admin,trainer,trainee');
        Route::get('/practical-works/{practical_work}/download', [PracticalWorkController::class, 'download'])->middleware('role:admin,trainer,trainee');
        Route::get('/assessments/{assessment}/preview', [AssessmentController::class, 'preview'])->middleware('role:admin,trainer,trainee');
        Route::get('/assessments/{assessment}/download', [AssessmentController::class, 'download'])->middleware('role:admin,trainer,trainee');

        Route::middleware('role:admin')->group(function (): void {
            Route::get('/admin/users', [AdminUserController::class, 'index']);
            Route::post('/admin/users', [AdminUserController::class, 'store']);
            Route::get('/admin/users/{user}', [AdminUserController::class, 'show']);
            Route::put('/admin/users/{user}', [AdminUserController::class, 'update']);
            Route::delete('/admin/users/{user}', [AdminUserController::class, 'destroy']);
            Route::patch('/admin/users/{user}/status', [AdminUserController::class, 'toggleStatus']);
            Route::get('/admin/settings', [AdminSettingsController::class, 'show']);
            Route::put('/admin/settings', [AdminSettingsController::class, 'update']);
            Route::post('/admin/settings/assets', [AdminSettingsController::class, 'uploadAsset']);
            Route::post('/admin/settings/action', [AdminSettingsController::class, 'action']);
            Route::get('/admin/module-assignments', [AdminModuleAssignmentController::class, 'index']);
            Route::post('/admin/module-assignments', [AdminModuleAssignmentController::class, 'store']);
            Route::delete('/admin/module-assignments/{trainer}/{module}', [AdminModuleAssignmentController::class, 'destroy']);
            Route::get('/trainees', [TraineeController::class, 'index']);
            Route::put('/trainees/{trainee}', [TraineeController::class, 'update']);
            Route::apiResource('trainers', TrainerController::class);
            Route::apiResource('modules', ModuleController::class);
        });

        Route::middleware('role:admin,trainer')->group(function (): void {
            Route::apiResource('courses', CourseController::class)->except(['index', 'show']);
            Route::apiResource('lessons', LessonController::class);
            Route::apiResource('quizzes', QuizController::class);
            Route::apiResource('practical-works', PracticalWorkController::class);
            Route::apiResource('assessments', AssessmentController::class);
        });

        Route::middleware('role:trainer')->group(function (): void {
            Route::get('/trainer/modules', [TrainerModuleController::class, 'index']);
            Route::get('/trainer/modules/{module}', [TrainerModuleController::class, 'show']);
        });

        Route::middleware('role:trainee')->group(function (): void {
            Route::get('/trainee/modules', [TraineeWorkspaceController::class, 'modules']);
            Route::get('/trainee/practical-works', [TraineeWorkspaceController::class, 'practicalWorks']);
            Route::get('/trainee/assessments', [TraineeWorkspaceController::class, 'assessments']);
            Route::post('/courses/{course}/enroll', [EnrollmentController::class, 'store']);
            Route::post('/lessons/{lesson}/complete', [LessonController::class, 'complete']);
            Route::post('/quizzes/{quiz}/submit', [QuizController::class, 'submit']);
            Route::get('/certificates', [CertificateController::class, 'index']);
        });
    });
});
