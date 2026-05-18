<?php

namespace Database\Seeders;

use App\Models\Assessment;
use App\Models\Certificate;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\PracticalWork;
use App\Models\PracticalWorkSubmission;
use App\Models\Quiz;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $admin = User::query()->updateOrCreate(
            ['email' => 'admin@edudev.ma'],
            [
                'name' => 'Admin EduDev',
                'role' => 'admin',
                'password' => Hash::make('password'),
                'specialty' => 'Administration',
                'bio' => 'Administrateur principal de la plateforme.',
            ]
        );

        $trainers = collect([
            [
                'name' => 'Omar Frontend',
                'email' => 'omar@edudev.ma',
                'specialty' => 'Développement web et JavaScript',
                'bio' => 'Anime les modules de développement web, JavaScript et interfaces modernes.',
            ],
            [
                'name' => 'Salma Backend',
                'email' => 'salma@edudev.ma',
                'specialty' => 'Back-end, données et sécurité',
                'bio' => 'Prend en charge les cours back-end, bases de données et contrôles.',
            ],
            [
                'name' => 'Youssef Agile',
                'email' => 'youssef@edudev.ma',
                'specialty' => 'Agilité et cloud native',
                'bio' => 'Encadre les ateliers agiles, cloud native et intégration projet.',
            ],
        ])->map(fn (array $trainer) => User::query()->updateOrCreate(
            ['email' => $trainer['email']],
            [
                ...$trainer,
                'role' => 'trainer',
                'password' => Hash::make('password'),
            ]
        ));

        $trainee = User::query()->updateOrCreate(
            ['email' => 'stagiaire@edudev.ma'],
            [
                'name' => 'Stagiaire Demo',
                'role' => 'trainee',
                'password' => Hash::make('password'),
                'specialty' => 'Développement digital - 1ère année',
                'bio' => 'Compte demo pour visualiser les formateurs et les modules.',
            ]
        );

        $modules = collect([
            [
                'title' => "Acquérir les bases de l'algorithmique",
                'slug' => 'acquerir-les-bases-de-l-algorithmique',
                'description' => 'Variables, conditions, boucles, tableaux, fonctions et logique de résolution de problèmes.',
                'year_level' => 1,
            ],
            [
                'title' => 'Programmer en Orienté Objet',
                'slug' => 'programmer-en-oriente-objet',
                'description' => 'Classes, objets, encapsulation, héritage, polymorphisme et conception orientée objet.',
                'year_level' => 1,
            ],
            [
                'title' => 'Développer des sites web statiques',
                'slug' => 'developper-des-sites-web-statiques',
                'description' => 'HTML, CSS, intégration responsive et bonnes pratiques de structuration des pages.',
                'year_level' => 1,
            ],
            [
                'title' => 'Programmer en JavaScript',
                'slug' => 'programmer-en-javascript',
                'description' => 'Syntaxe JavaScript, DOM, événements, fonctions et interactions côté client.',
                'year_level' => 1,
            ],
            [
                'title' => 'Manipuler des bases de données',
                'slug' => 'manipuler-des-bases-de-donnees',
                'description' => 'Modélisation relationnelle, SQL, jointures, requêtes et manipulation de données.',
                'year_level' => 1,
            ],
            [
                'title' => 'Développer des sites web dynamiques',
                'slug' => 'developper-des-sites-web-dynamiques',
                'description' => 'Développement web dynamique avec formulaires, sessions, données et architecture serveur.',
                'year_level' => 1,
            ],
            [
                'title' => "S'initier à la sécurité des systèmes d'information",
                'slug' => 's-initier-a-la-securite-des-systemes-d-information',
                'description' => 'Principes de sécurité, authentification, risques web et bonnes pratiques de protection.',
                'year_level' => 1,
            ],
            [
                'title' => 'Approche agile',
                'slug' => 'approche-agile',
                'description' => 'Méthodes agiles, Scrum, collaboration, backlog, sprint et amélioration continue.',
                'year_level' => 2,
            ],
            [
                'title' => 'Gestion des données',
                'slug' => 'gestion-des-donnees',
                'description' => 'Organisation, exploitation, qualité et traitement des données dans une application.',
                'year_level' => 2,
            ],
            [
                'title' => 'Développement front-end',
                'slug' => 'developpement-front-end',
                'description' => 'Applications front-end modernes, composants, état, API et expérience utilisateur.',
                'year_level' => 2,
            ],
            [
                'title' => 'Développement back-end',
                'slug' => 'developpement-back-end',
                'description' => 'API, services, validation, persistance, sécurité et architecture back-end.',
                'year_level' => 2,
            ],
            [
                'title' => "Création d'une application Cloud native",
                'slug' => 'creation-d-une-application-cloud-native',
                'description' => 'Conception, conteneurisation, déploiement et exploitation d’une application cloud native.',
                'year_level' => 2,
            ],
        ])->map(fn (array $moduleData) => Module::query()->updateOrCreate(
            ['slug' => $moduleData['slug']],
            $moduleData
        ))->keyBy('slug');

        $modules['acquerir-les-bases-de-l-algorithmique']->trainers()->syncWithoutDetaching([$trainers[0]->id]);
        $modules['programmer-en-oriente-objet']->trainers()->syncWithoutDetaching([$trainers[1]->id]);
        $modules['developper-des-sites-web-statiques']->trainers()->syncWithoutDetaching([$trainers[0]->id]);
        $modules['programmer-en-javascript']->trainers()->syncWithoutDetaching([$trainers[0]->id]);
        $modules['manipuler-des-bases-de-donnees']->trainers()->syncWithoutDetaching([$trainers[1]->id]);
        $modules['developper-des-sites-web-dynamiques']->trainers()->syncWithoutDetaching([$trainers[1]->id]);
        $modules['s-initier-a-la-securite-des-systemes-d-information']->trainers()->syncWithoutDetaching([$trainers[1]->id]);
        $modules['approche-agile']->trainers()->syncWithoutDetaching([$trainers[2]->id]);
        $modules['gestion-des-donnees']->trainers()->syncWithoutDetaching([$trainers[1]->id, $trainers[2]->id]);
        $modules['developpement-front-end']->trainers()->syncWithoutDetaching([$trainers[0]->id]);
        $modules['developpement-back-end']->trainers()->syncWithoutDetaching([$trainers[1]->id]);
        $modules['creation-d-une-application-cloud-native']->trainers()->syncWithoutDetaching([$trainers[2]->id]);

        $courses = collect([
            [
                'module_id' => $modules['programmer-en-javascript']->id,
                'trainer_id' => $trainers[0]->id,
                'title' => 'Introduction pratique à JavaScript',
                'slug' => 'introduction-pratique-a-javascript',
                'description' => 'Découvrir la syntaxe, manipuler le DOM et créer des interactions simples.',
                'level' => 'intermediate',
                'duration_hours' => 24,
                ...$this->seedPdfForCourse('introduction-javascript.pdf', 'Introduction pratique à JavaScript'),
            ],
            [
                'module_id' => $modules['developpement-back-end']->id,
                'trainer_id' => $trainers[1]->id,
                'title' => 'API Laravel pour plateforme de formation',
                'slug' => 'api-laravel-pour-plateforme-de-formation',
                'description' => 'Concevoir une API back-end pour gérer les formateurs, les modules et les stagiaires.',
                'level' => 'advanced',
                'duration_hours' => 30,
                ...$this->seedPdfForCourse('api-laravel-plateforme.pdf', 'API Laravel pour plateforme de formation'),
            ],
            [
                'module_id' => $modules['manipuler-des-bases-de-donnees']->id,
                'trainer_id' => $trainers[1]->id,
                'title' => 'SQL relationnel pour le suivi pédagogique',
                'slug' => 'sql-relationnel-pour-le-suivi-pedagogique',
                'description' => 'Modéliser les relations et écrire des requêtes SQL pour suivre les apprentissages.',
                'level' => 'beginner',
                'duration_hours' => 18,
                ...$this->seedPdfForCourse('sql-suivi-pedagogique.pdf', 'SQL relationnel pour le suivi pédagogique'),
            ],
        ])->map(fn (array $courseData) => Course::query()->updateOrCreate(
            ['slug' => $courseData['slug']],
            $courseData
        ));

        $courses[0]->trainees()->syncWithoutDetaching([$trainee->id => ['status' => 'in_progress']]);
        $courses[1]->trainees()->syncWithoutDetaching([$trainee->id => ['status' => 'in_progress']]);
        $courses[2]->trainees()->syncWithoutDetaching([$trainee->id => ['status' => 'planned']]);

        collect([
            [
                'course_id' => $courses[0]->id,
                'trainer_id' => $trainers[0]->id,
                'title' => 'TP Manipulation du DOM',
                'instructions' => 'Créer une page interactive qui affiche une liste de modules et permet de filtrer les résultats.',
                'due_at' => now()->addDays(5),
            ],
            [
                'course_id' => $courses[1]->id,
                'trainer_id' => $trainers[1]->id,
                'title' => 'TP API Laravel',
                'instructions' => 'Créer des endpoints REST pour les modules, les cours, les TP et les contrôles.',
                'due_at' => now()->addDays(8),
            ],
        ])->each(fn (array $practicalWork) => PracticalWork::query()->updateOrCreate(
            ['title' => $practicalWork['title']],
            $practicalWork
        ));

        $tpPdf = $this->seedPdfDocument('tp-submission-demo.pdf', 'TP Submission Demo');
        PracticalWorkSubmission::query()->updateOrCreate(
            [
                'practical_work_id' => PracticalWork::query()->where('title', 'TP Manipulation du DOM')->value('id'),
                'trainee_id' => $trainee->id,
            ],
            [
                'file_disk' => $tpPdf['document_disk'],
                'file_path' => $tpPdf['document_path'],
                'original_name' => 'tp-submission-demo.pdf',
                'mime_type' => $tpPdf['document_mime_type'],
                'file_size' => $tpPdf['document_size'],
                'submitted_at' => now()->subDay(),
                'score' => 16,
                'comment' => 'Bonne structure generale, pense a mieux separer les composants.',
                'corrected_at' => now()->subHours(12),
            ]
        );

        collect([
            [
                'module_id' => $modules['developpement-back-end']->id,
                'course_id' => $courses[1]->id,
                'trainer_id' => $trainers[1]->id,
                'title' => 'Contrôle API Laravel',
                'format' => 'exam',
                'scheduled_at' => now()->addDays(10),
                'duration_minutes' => 90,
                'total_points' => 20,
            ],
            [
                'module_id' => $modules['programmer-en-javascript']->id,
                'course_id' => $courses[0]->id,
                'trainer_id' => $trainers[0]->id,
                'title' => 'Quiz JavaScript et DOM',
                'format' => 'quiz',
                'scheduled_at' => now()->addDays(6),
                'duration_minutes' => 30,
                'total_points' => 10,
            ],
        ])->each(fn (array $assessment) => Assessment::query()->updateOrCreate(
            ['title' => $assessment['title']],
            $assessment
        ));

        $lessons = collect([
            [
                'course_id' => $courses[0]->id,
                'trainer_id' => $trainers[0]->id,
                'title' => 'Introduction à JavaScript',
                'type' => 'text',
                'content' => 'Présentation de la syntaxe, des variables et des premières interactions.',
                'position' => 1,
                'duration_minutes' => 20,
            ],
            [
                'course_id' => $courses[0]->id,
                'trainer_id' => $trainers[0]->id,
                'title' => 'Manipuler le DOM',
                'type' => 'video',
                'video_url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                'position' => 2,
                'duration_minutes' => 18,
            ],
            [
                'course_id' => $courses[1]->id,
                'trainer_id' => $trainers[1]->id,
                'title' => 'Migrations et relations Laravel',
                'type' => 'text',
                'content' => 'Création des tables, modèles Eloquent et endpoints API.',
                'position' => 1,
                'duration_minutes' => 25,
            ],
        ])->map(fn (array $lesson) => Lesson::query()->updateOrCreate(
            ['course_id' => $lesson['course_id'], 'title' => $lesson['title']],
            $lesson
        ));

        $trainee->completedLessons()->syncWithoutDetaching([
            $lessons[0]->id => ['completed' => true, 'completed_at' => now()],
        ]);

        $quiz = Quiz::query()->updateOrCreate(
            ['course_id' => $courses[0]->id, 'title' => 'Quiz JavaScript fondamentaux'],
            [
                'trainer_id' => $trainers[0]->id,
                'pass_percentage' => 70,
            ]
        );

        $quiz->questions()->delete();
        $quiz->questions()->createMany([
            [
                'prompt' => 'Quel mot-clé permet de déclarer une constante en JavaScript ?',
                'option_a' => 'const',
                'option_b' => 'define',
                'option_c' => 'fixed',
                'option_d' => 'static',
                'correct_answer' => 'a',
            ],
            [
                'prompt' => 'Quelle méthode permet de sélectionner un élément avec son identifiant ?',
                'option_a' => 'document.findId',
                'option_b' => 'document.getElementById',
                'option_c' => 'window.selectId',
                'option_d' => 'html.get',
                'correct_answer' => 'b',
            ],
        ]);

        $quiz->results()->updateOrCreate(
            ['user_id' => $trainee->id],
            ['score' => 2, 'total' => 2, 'submitted_at' => now()]
        );

        Certificate::query()->updateOrCreate(
            ['course_id' => $courses[0]->id, 'user_id' => $trainee->id],
            ['code' => 'CERT-REACT-001', 'issued_at' => now()]
        );
    }

    private function seedPdfForCourse(string $fileName, string $title): array
    {
        return $this->seedPdfDocument("courses/seeded/{$fileName}", $title);
    }

    private function seedPdfDocument(string $path, string $title): array
    {
        $pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 95>>stream\nBT /F1 24 Tf 72 760 Td ({$title}) Tj 0 -36 Td /F1 14 Tf (Document PDF de démonstration EduDev.) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000062 00000 n \n0000000118 00000 n \n0000000244 00000 n \n0000000390 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n460\n%%EOF";

        Storage::disk('local')->put($path, $pdf);

        return [
            'document_disk' => 'local',
            'document_path' => $path,
            'document_name' => Str::afterLast($path, '/'),
            'document_mime_type' => 'application/pdf',
            'document_size' => Storage::disk('local')->size($path),
        ];
    }
}


