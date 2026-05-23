<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Module;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ModuleController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Module::query()->with(['trainers:id,first_name,last_name', 'courses:id,module_id,title'])->orderBy('title')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'year_level' => ['nullable', 'integer', 'in:1,2'],
            'option' => ['nullable', 'string', 'in:Full Stack,Mobile,RV/RA'],
        ]);

        $module = Module::query()->create([
            'title' => $data['title'],
            'slug' => Str::slug($data['title']).'-'.Str::lower(Str::random(5)),
            'description' => $data['description'] ?? null,
            'year_level' => $data['year_level'] ?? null,
            'option' => $data['option'] ?? null,
        ]);

        return response()->json($module->load(['trainers:id,first_name,last_name']), 201);
    }

    public function show(Module $module): JsonResponse
    {
        return response()->json($module->load(['trainers:id,first_name,last_name', 'courses.trainer:id,first_name,last_name']));
    }

    public function update(Request $request, Module $module): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'year_level' => ['nullable', 'integer', 'in:1,2'],
            'option' => ['nullable', 'string', 'in:Full Stack,Mobile,RV/RA'],
        ]);

        $module->update([
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'year_level' => $data['year_level'] ?? null,
            'option' => $data['option'] ?? null,
        ]);

        return response()->json($module->load(['trainers:id,first_name,last_name']));
    }

    public function destroy(Module $module): JsonResponse
    {
        $module->delete();

        return response()->json(['message' => 'Module deleted.']);
    }
}
