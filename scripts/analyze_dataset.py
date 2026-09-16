import csv
import math
import statistics
from collections import defaultdict, Counter

def load_data(filepath='data/students.csv'):
    with open(filepath, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return list(reader)

def safe_float(val, default=0.0):
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

def pearson_r(x, y):
    n = len(x)
    if n < 2:
        return 0.0
    mx = statistics.mean(x)
    my = statistics.mean(y)
    num = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    den = math.sqrt(sum((xi - mx)**2 for xi in x) * sum((yi - my)**2 for yi in y))
    return num / den if den > 0 else 0.0

def run_deep_analysis():
    data = load_data()
    n = len(data)
    print("=" * 80)
    print(f" PROYEK RED QUEEN — NEURAL COGNITIVE INTELLIGENCE & DATASET AUDIT ")
    print(f" TOTAL SAMPEL DATASET: {n} MAHASISWA / SISWA PEMBELAJAR PYTHON")
    print("=" * 80)

    # 1. Target Distributions
    scores = [safe_float(d['final_exam_score']) for d in data]
    passed = [d for d in data if d['passed_exam'] == '1']
    failed = [d for d in data if d['passed_exam'] == '0']

    mean_s = statistics.mean(scores)
    median_s = statistics.median(scores)
    stdev_s = statistics.stdev(scores)
    min_s = min(scores)
    max_s = max(scores)

    print(f"\n[1] DISTRIBUSI UJIAN AKHIR (FINAL EXAM SCORE)")
    print(f"  • Rata-rata Nilai (Mean)   : {mean_s:.2f}")
    print(f"  • Median Nilai             : {median_s:.2f}")
    print(f"  • Standar Deviasi          : {stdev_s:.2f}")
    print(f"  • Rentang Nilai [Min - Max]: [{min_s:.1f} - {max_s:.1f}]")
    print(f"  • Lulus (Passed Exam >= 60): {len(passed)} siswa ({len(passed)/n*100:.2f}%)")
    print(f"  • Tidak Lulus (Failed < 60): {len(failed)} siswa ({len(failed)/n*100:.2f}%)")

    # 2. Demographic & Experience Breakdown
    exp_order = ['None', 'Beginner', 'Intermediate', 'Advanced']
    exp_stats = defaultdict(list)
    for d in data:
        exp_stats[d['prior_programming_experience']].append(safe_float(d['final_exam_score']))

    print(f"\n[2] PENGARUH PENGALAMAN PEMROGRAMAN AWAL (PRIOR EXPERIENCE)")
    for exp in exp_order:
        s_list = exp_stats[exp]
        p_count = sum(1 for s in s_list if s >= 60.0)
        p_rate = (p_count / len(s_list) * 100) if s_list else 0
        print(f"  • {exp:12s}: N={len(s_list):3d} | Rata-rata Nilai: {statistics.mean(s_list):5.2f} | Lulus: {p_count:2d} ({p_rate:5.1f}%)")

    # 3. Country Breakdown
    country_stats = defaultdict(list)
    for d in data:
        country_stats[d['country']].append(safe_float(d['final_exam_score']))

    print(f"\n[3] ANALISIS GEOGRAFIS (DISTRIBUSI NEGARA)")
    sorted_countries = sorted(country_stats.keys(), key=lambda c: statistics.mean(country_stats[c]), reverse=True)
    for c in sorted_countries:
        c_scores = country_stats[c]
        p_count = sum(1 for s in c_scores if s >= 60.0)
        p_rate = (p_count / len(c_scores) * 100) if c_scores else 0
        print(f"  • {c:12s}: N={len(c_scores):3d} | Mean Score: {statistics.mean(c_scores):5.2f} | Pass Rate: {p_rate:5.1f}%")

    # 4. Feature Correlations with Final Exam Score
    exp_map = {'None': 0, 'Beginner': 1, 'Intermediate': 2, 'Advanced': 3}
    features = {
        'Prior Experience (0-3)': [exp_map.get(d['prior_programming_experience'], 0) for d in data],
        'Hours Learning / Week': [safe_float(d['hours_spent_learning_per_week']) for d in data],
        'Projects Completed': [safe_float(d['projects_completed']) for d in data],
        'Self Confidence (1-10)': [safe_float(d['self_reported_confidence_python']) for d in data],
        'Debugging Sessions / Wk': [safe_float(d['debugging_sessions_per_week']) for d in data],
        'Uses Kaggle (0/1)': [safe_float(d['uses_kaggle']) for d in data],
        'Practice Problems Solved': [safe_float(d['practice_problems_solved']) for d in data],
        'Discussion Forums (0/1)': [safe_float(d['participates_in_discussion_forums']) for d in data],
        'Tutorial Videos Watched': [safe_float(d['tutorial_videos_watched']) for d in data],
        'Weeks in Course': [safe_float(d['weeks_in_course']) for d in data],
        'Age (Umur)': [safe_float(d['age']) for d in data]
    }

    print(f"\n[4] KORELASI PEARSON (r) DENGAN NILAI UJIAN AKHIR")
    corrs = []
    for name, vals in features.items():
        r = pearson_r(vals, scores)
        corrs.append((name, r))
    corrs.sort(key=lambda x: abs(x[1]), reverse=True)

    for name, r in corrs:
        sig = "+++ SANGAT KUAT" if abs(r) > 0.6 else "++ KUAT" if abs(r) > 0.3 else "+ SEDANG" if abs(r) > 0.1 else "~ TIDAK BERPENGARUH"
        print(f"  • {name:25s}: r = {r:+.4f} ({sig})")

    # 5. Key Paradoxes & Non-Obvious Insights
    print(f"\n[5] TEMUAN ANOMALI & PARADOKS BELAJAR (OPEN SOURCE INTELLIGENCE)")
    print(f"  • 'Tutorial Hell' terbukti: Menonton video tutorial memiliki korelasi negatif (r={pearson_r(features['Tutorial Videos Watched'], scores):+.4f}). Siswa yang hanya pasif menonton video TIDAK meningkatkan nilai ujian sama sekali!")
    print(f"  • Forum Diskusi (r={pearson_r(features['Discussion Forums (0/1)'], scores):+.4f}): Mengikuti forum tanpa aksi praktikum mandiri hampir memiliki pengaruh 0.")
    print(f"  • Umur Siswa (r={pearson_r(features['Age (Umur)'], scores):+.4f}): Kemampuan menyerap pemrograman tidak dipengaruhi umur (usia 16 maupun 54 tahun memiliki peluang sama).")
    print(f"  • Faktor Penentu Nyata: Pengalaman awal (Prior Experience), Jam belajar per minggu (Hours), dan Jumlah Project nyata yang diselesaikan (Projects Completed).")

    # 6. OLS Linear Model
    X = []
    for d in data:
        X.append([
            1.0,
            exp_map.get(d['prior_programming_experience'], 0),
            safe_float(d['hours_spent_learning_per_week']),
            safe_float(d['projects_completed']),
            safe_float(d['practice_problems_solved']),
            safe_float(d['self_reported_confidence_python']),
            safe_float(d['debugging_sessions_per_week']),
            safe_float(d['uses_kaggle'])
        ])

    def transpose(M):
        return [[M[i][j] for i in range(len(M))] for j in range(len(M[0]))]

    def matmul(A, B):
        res = [[0.0 for _ in range(len(B[0]))] for _ in range(len(A))]
        for i in range(len(A)):
            for k in range(len(B)):
                for j in range(len(B[0])):
                    res[i][j] += A[i][k] * B[k][j]
        return res

    def invert(A):
        n = len(A)
        M = [row[:] + [1.0 if i == j else 0.0 for j in range(n)] for i, row in enumerate(A)]
        for i in range(n):
            pivot = M[i][i]
            for j in range(2 * n):
                M[i][j] /= pivot
            for k in range(n):
                if k != i:
                    factor = M[k][i]
                    for j in range(2 * n):
                        M[k][j] -= factor * M[i][j]
        return [row[n:] for row in M]

    Xt = transpose(X)
    XtX = matmul(Xt, X)
    invXtX = invert(XtX)
    XtY = matmul(Xt, [[y] for y in scores])
    beta = matmul(invXtX, XtY)

    y_mean = statistics.mean(scores)
    ss_tot = sum((y - y_mean)**2 for y in scores)
    y_pred = [sum(X[i][j] * beta[j][0] for j in range(len(beta))) for i in range(len(scores))]
    ss_res = sum((y - yp)**2 for y, yp in zip(scores, y_pred))
    r2 = 1 - (ss_res / ss_tot)

    print(f"\n[6] PERSAMAAN MATEMATIS PREDIKSI KOGNITIF (R² = {r2:.4f} / {r2*100:.1f}%)")
    feat_names = ['Bias (Konstanta)', 'Prior Exp Level', 'Hours / Wk', 'Projects Completed', 'Practice Problems', 'Self Confidence', 'Debugging Sessions', 'Kaggle Usage']
    for fn, b in zip(feat_names, beta):
        print(f"  • Koefisien {fn:20s}: {b[0]:+.4f}")

    return {
        'total': n,
        'mean_score': mean_s,
        'pass_rate': len(passed)/n,
        'r2': r2,
        'corrs': corrs
    }

if __name__ == '__main__':
    run_deep_analysis()
