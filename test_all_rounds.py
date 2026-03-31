import requests
import os
import json

BASE_URL = "http://localhost:3001/api"
ADMIN_EMAIL = "iqignite-yugenfest26@jkkmct.edu.in"
ADMIN_PASS = "Admin@123"

def run_test():
    try:
        # 1. Login Admin
        print("Logging in as Admin...")
        login_res = requests.post(f"{BASE_URL}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        if login_res.status_code != 200:
            print(f"Admin Login Failed: {login_res.text}")
            return
        admin_token = login_res.json()["token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # 2. Create Job
        print("Creating Job...")
        job_data = {
            "title": "Software Engineer (Test)",
            "description": "Looking for a software engineer to test our rounds.",
            "company": "Test Corp",
            "requiredSkills": ["React", "Node.js", "Python"],
            "experience": 2,
            "education": "Bachelor's Degree",
            "totalPositions": 5,
            "maxApplicants": 10,
            "startDate": "2026-03-31T00:00:00.000Z",
            "endDate": "2026-12-31T23:59:59.000Z",
            "eliminationRatios": {
                "ats": 90,
                "aptitude": 90,
                "technical": 90,
                "gd": 90,
                "interview": 100
            },
            "aptitudeQuestions": [
                {"question": "What is 2+2?", "options": ["3", "4", "5", "6"], "correctAnswer": 1, "difficulty": "easy"}
            ],
            "technicalQuestions": [
                {"question": "What is React?", "options": ["Library", "Framework", "Language"], "correctAnswer": 0, "difficulty": "easy", "topic": "React"}
            ],
            "gdTopics": ["AI in Education"],
            "interviewQuestions": ["Tell me about yourself."]
        }
        job_res = requests.post(f"{BASE_URL}/jobs", json=job_data, headers=headers)
        if job_res.status_code != 201:
            print(f"Job Creation Failed: {job_res.text}")
            return
        job_id = job_res.json()["_id"]
        print(f"Job created: {job_id}")

        # 3. Register Candidate
        print("Registering Candidate...")
        cand_email = f"candidate_{os.urandom(4).hex()}@example.com"
        cand_pass = "Cand@123"
        reg_res = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test Candidate",
            "email": cand_email,
            "password": cand_pass,
            "phone": "9876543210",
            "role": "candidate"
        })
        if reg_res.status_code != 201:
            print(f"Candidate Registration Failed: {reg_res.text}")
            return
        cand_token = reg_res.json()["token"]
        cand_headers = {"Authorization": f"Bearer {cand_token}"}

        # 4. Upload Resume (Apply)
        print("Uploading Resume...")
        with open("dummy_resume.txt", "rb") as f:
            files = {"resume": ("resume.txt", f, "text/plain")}
            up_res = requests.post(f"{BASE_URL}/resume/upload/{job_id}", headers={"Authorization": f"Bearer {cand_token}"}, files=files)
        
        if up_res.status_code != 201:
            print(f"Resume Upload Failed: {up_res.text}")
            return
        print(f"ATS Score: {up_res.json().get('atsScore')}%")

        # 5. Advance Rounds
        rounds = ["accepting", "ats", "aptitude", "technical", "gd", "interview"]

        for round_name in rounds:
            print(f"\n--- Current Job Phase: {round_name} ---")
            
            # Candidate performs action if needed for the current round
            if round_name == "aptitude":
                print("Candidate submitting Aptitude test...")
                res = requests.post(f"{BASE_URL}/aptitude/{job_id}/submit", headers=cand_headers, json={"answers": {"0": 1}})
                print(f"Submission status: {res.status_code}")
            elif round_name == "technical":
                print("Candidate submitting Technical test...")
                res = requests.post(f"{BASE_URL}/technical/{job_id}/submit", headers=cand_headers, json={"answers": {"0": 0}})
                print(f"Submission status: {res.status_code}")
            elif round_name == "gd":
                print("Candidate submitting GD...")
                res = requests.post(f"{BASE_URL}/gd/{job_id}/submit", headers=cand_headers, json={"transcript": "AI is very helpful for learning development and education."})
                print(f"Submission status: {res.status_code}")
            elif round_name == "interview":
                print("Candidate submitting Interview...")
                res = requests.post(f"{BASE_URL}/interview/{job_id}/submit", headers=cand_headers, json={"answers": [{"question": "Tell me about yourself.", "answer": "I am a test candidate with passion for code."}], "scores": {"eyeContact": 90, "smileFrequency": 30}})
                print(f"Submission status: {res.status_code}")

            # Admin advances to NEXT round
            print(f"Admin advancing from {round_name}...")
            adv_res = requests.post(f"{BASE_URL}/jobs/{job_id}/advance", headers=headers)
            if adv_res.status_code == 200:
                print(f"Success: {adv_res.json().get('message')}")
            else:
                print(f"Advance Failed: {adv_res.text}")
                break

        print("\n--- All Rounds Completed Successfully! ---")
        
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    run_test()
