import requests
import time

# Target Configuration
BASE_URL = "http://127.0.0.1:8000"  
QUIZ_PIN = "0972"

# Ingestion Endpoints
UNLOCK_URL = f"{BASE_URL}/api/quizzes/unlock/"
SUBMIT_URL = f"{BASE_URL}/api/submissions/"

# 50 completely unique short answers for Question 1
FEELINGS_POOL = [
    "Optimistic", "Exhausted", "Intrigued", "Puzzled", "Hyper-focused", 
    "Calm", "Anxious", "Eager", "Distracted", "Enthusiastic",
    "Sleepy", "Confident", "Bored", "Curious", "Stressed", 
    "Neutral", "Informed", "Inspired", "Overwhelmed", "Restless",
    "Cheerless", "Energetic", "Apprehensive", "Determined", "Doubtful",
    "Hopeful", "Frustrated", "Content", "Relaxed", "Apathetic",
    "Amused", "Cynical", "Satisfied", "Impatient", "Thoughtful",
    "Uneasy", "Vibrant", "Melancholy", "Alert", "Passive",
    "Dynamic", "Hesitant", "Jovial", "Weary", "Skeptical",
    "Empowered", "Mellow", "Flustered", "Grateful", "Zesty"
]

# 50 completely unique, highly descriptive essay answers for Question 2
PYTHAGORAS_ESSAYS_POOL = [
    "The Pythagorean theorem states that in a right-angled triangle, the area of the square on the hypotenuse is equal to the sum of the areas of the squares on the other two sides ($a^2 + b^2 = c^2$).",
    "It forms the basis of Euclidean geometry, demonstrating that the distance squared along the long side matches the sum of the horizontal and vertical side components squared.",
    "If you have a right triangle with legs of length 3 and 4, the hypotenuse must be 5 because $3^2 + 4^2 = 9 + 16 = 25$, and the square root of 25 is exactly 5.",
    "Geometrically, it can be visualized by placing four identical right triangles inside a larger square, proving via spatial algebra that the inner tilt area resolves precisely to $c^2$.",
    "The relationship $a^2 + b^2 = c^2$ applies strictly to flat surfaces. If you map these vectors onto a sphere, spherical excess causes the rule to break down due to non-Euclidean curvature.",
    "Bhaskara proved this theorem using a simple visual diagram of a square inside a square with the single word directive: 'Behold!' It proves the geometric equality cleanly.",
    "In vector calculus and backend engineering spatial queries, we use this formula continuously to compute the Euclidean distance metric between two data coordinates in an $(x, y)$ coordinate plane.",
    "The hypotenuse is always the side opposite the 90-degree right angle. It represents the shortest path linking the endpoints of the two orthogonal vector segments.",
    "A Babylonian clay tablet known as Plimpton 322 shows that ancient mathematicians understood these integer triples long before Pythagoras formally documented the mathematical proof.",
    "When programming graphical applications or video game engines, the distance formula $d = \sqrt{\Delta x^2 + \Delta y^2}$ is derived directly from this foundational theorem.",
    "A primitive Pythagorean triple consists of three positive integers $(a, b, c)$ that have no common divisor and satisfy the equation, such as $(5, 12, 13)$ or $(8, 15, 17)$.",
    "President James A. Garfield actually developed a unique original mathematical proof of the theorem using a trapezoid configuration consisting of three right-angled triangles.",
    "Architects and construction crews utilize a practical 3-4-5 layout technique with measuring tape to ensure walls meet at a perfectly square, exact 90-degree angle.",
    "The algebraic abstraction allows us to scale this principle into three dimensions seamlessly, tracking position vectors using the extended spatial formula $a^2 + b^2 + d^2 = c^2$.",
    "If the square of the longest side is strictly greater than the sum of the squares of the shorter sides, the triangle is classified as obtuse rather than a right triangle.",
    "Conversely, if $a^2 + b^2$ turns out to be structurally greater than $c^2$, the interior angle opposite the long side shrinks, rendering it an acute triangle.",
    "In a right triangle, the trigonometric identities sin and cos are fundamentally locked to this theorem, forming the trigonometric basis where $\sin^2(\theta) + \cos^2(\theta) = 1$.",
    "Euclid's Elements presents an elegant geometric proof using a windmill-shaped configuration, matching split rectangle areas to the corresponding outer boundary squares.",
    "When computing coordinates on computer displays, pixel distances are tracked via floating-point variables using this equation, though rounding errors can accumulate over time.",
    "The theorem provides a clear bridge linking geometric shapes with algebraic equations, which fundamentally transformed early mathematical analysis methodologies.",
    "Einstein wrote an early essay detailing a proof that relies on scaling properties of similar triangles, avoiding complex area slicing entirely through proportional ratios.",
    "It acts as the core mathematical anchor for GPS triangulation engines, resolving cellular location bounds by solving intersecting distance radii equations.",
    "The longest side, the hypotenuse, grows non-linearly relative to the legs. Doubling both leg lengths will scale the total hypotenuse path by a factor of exactly two.",
    "Historically, the discovery led the Pythagoreans to encounter irrational numbers like $\sqrt{2}$ for the first time, causing an internal philosophical crisis in their school.",
    "The formula allows surveyors to calculate the exact elevation slope of mountain terrain by mapping vertical altimeter steps against flat mapping coordinates.",
    "Using complex numbers, the absolute magnitude of a complex value $z = x + iy$ is calculated as $|z| = \sqrt{x^2 + y^2}$, a direct application of the theorem.",
    "In structural engineering, load-bearing truss layouts are arranged in triangular arrays relying on this equation to ensure equal distribution of mechanical stress points.",
    "The theorem can be generalized to any shape: if you construct similar shapes on each side of the triangle, the area of the largest equals the sum of the other two.",
    "A right isosceles triangle with side length 1 will yield a hypotenuse of $\sqrt{2}$. This proves that geometric lengths cannot always be expressed as clean integer ratios.",
    "Data science algorithms utilizing K-Nearest Neighbors (KNN) calculate point proximity vectors across multidimensional features by utilizing a variant of this equation.",
    "The Chinese mathematical classic Zhoubi Suanjing documented this property as the Gougu Theorem centuries before it gained widespread adoption across the Mediterranean.",
    "If you know the coordinates of two nodes in a network grid, you can treat their differences as orthogonal legs to calculate the exact line-of-sight signal path.",
    "The formula provides a deterministic method to verify perpendicularity in physical layout spaces without needing access to a specialized optical protractor device.",
    "Advanced hydrocodes and physics engine systems simulate material deformation bounds by resolving structural velocity vectors into independent orthogonal component elements.",
    "In navigation systems, great-circle distances approximate flat-plane triangles locally, allowing small-scale mapping tasks to use standard planar formulas reliably.",
    "Leonardo da Vinci contributed an artistic geometric proof showing that the overlapping symmetry of rotated triangle frameworks forces the area equation to match.",
    "The math demonstrates that the hypotenuse path is strictly shorter than the sum of both legs combined, demonstrating a basic instance of the triangle inequality rule.",
    "When configuring audio speaker setups, sound wave path delays are calculated by evaluating the physical distance vectors from the source using this equation.",
    "Thales' theorem states that a triangle inscribed in a semicircle forms a right angle, creating a perfect framework to observe Pythagorean side balances in action.",
    "For multi-layer backend networks, optimized request routing pathways minimize latency variables by analyzing distance nodes via basic Cartesian spatial mathematics.",
    "The theorem remains perfectly valid even when side lengths are tiny fraction variables, proving that scaling down dimensions does not alter fundamental geometric ratios.",
    "The math shows that you can never create a right-angled triangle where the hypotenuse is equal to or shorter than one of its individual perpendicular legs.",
    "When analyzing shadows cast by structures, the height of the object and the shadow length form the legs of a right triangle, revealing light ray vectors.",
    "The proof by dissection shows that you can physically slice the two smaller squares into a few pieces and assemble them perfectly to fill the large square.",
    "In machine learning models processing image tracking loops, bounding box distance offsets are continually parsed using basic vector magnitude equations.",
    "The mathematical properties of orthogonal functions in Fourier analysis can be viewed as an abstract, infinite-dimensional extension of this basic side relation.",
    "Every time a graphic processing unit (GPU) rasterizes a 3D polygon onto a flat gaming monitor, it executes millions of distance vector checks using this math.",
    "The concept of variance in statistics, where squared deviations are added up, shares a deep conceptual structure with adding the squared legs of a triangle.",
    "A right triangle whose side lengths form a geometric progression will have side proportions directly equal to the golden ratio, known as a Kepler triangle.",
    "Ultimately, the equation demonstrates the clean, mathematical perfection built into our physical space, showing that directional movements scale reliably."
]

def run_flood_test():
    print(f"🚀 Starting Ingestion Flood Test for Quiz PIN: {QUIZ_PIN}")
    print(f"👥 Streaming 50 ENTIRELY UNIQUE student answers to database...")
    print("-" * 60)

    session = requests.Session()

    for i in range(1, 51):
        student_name = f"Student_{i}"
        
        # 1. Broad-Spectrum Unlock Payload to bypass 400 errors
        unlock_payload = {
            "pin": QUIZ_PIN,
            "quiz_pin": QUIZ_PIN,
            "access_code": QUIZ_PIN,
            "student_name": student_name,
            "name": student_name,
            "username": student_name
        }
        
        try:
            unlock_res = session.post(UNLOCK_URL, json=unlock_payload, timeout=5)
            if unlock_res.status_code not in [200, 201]:
                print(f"❌ [{i}/50] Unlock Rejected. Status: {unlock_res.status_code} | Body: {unlock_res.text}")
                continue
        except Exception as e:
            print(f"💥 Network error during unlock for {student_name}: {e}")
            continue

        # Extract unique indices from our pools
        feeling_ans = FEELINGS_POOL[i - 1]
        essay_ans = PYTHAGORAS_ESSAYS_POOL[i - 1]

        # 2. Structured JSON Payload
        submit_payload = {
            "pin": QUIZ_PIN,
            "quiz_pin": QUIZ_PIN,
            "access_code": QUIZ_PIN,
            "student_name": student_name,
            "name": student_name,
            "answers": [
                {
                    "question_text": "How are you feeling ?",
                    "question_type": "Short Answer",
                    "answer": feeling_ans,
                    "answer_text": feeling_ans
                },
                {
                    "question_text": "Explain the pythagoras theorem in detail ?",
                    "question_type": "Essay Question",
                    "answer": essay_ans,
                    "answer_text": essay_ans
                }
            ]
        }

        # 3. Submit
        try:
            submit_res = session.post(SUBMIT_URL, json=submit_payload, timeout=5)
            if submit_res.status_code in [200, 201]:
                print(f"✅ [{i}/50] Success: {student_name} | Feeling: {feeling_ans[:10]}...")
            else:
                print(f"⚠️ [{i}/50] Submission Failed: {submit_res.status_code} | {submit_res.text}")
        except Exception as e:
            print(f"💥 Network error during submission for {student_name}: {e}")
        
        time.sleep(0.04)

    print("=" * 60)
    print("🏁 UNIQUE INGESTION FLOOD COMPLETE. Check the Live Dashboard!")

if __name__ == "__main__":
    run_flood_test()