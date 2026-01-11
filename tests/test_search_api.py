from models import db, Job


def _seed_jobs():
    jobs = [
        Job(job_number="A-100", client="Alpha", address="123 Main St", status="Needs Fieldwork"),
        Job(job_number="B-200", client="Bravo", address="456 Elm St", status="Complete"),
        Job(job_number="C-300", client="ClientCo", address="789 Oak St", status="Needs Fieldwork"),
    ]
    db.session.add_all(jobs)
    db.session.commit()


def test_search_jobs_by_job_number(auth_client, app):
    with app.app_context():
        _seed_jobs()

    resp = auth_client.get("/api/jobs/search?q=B-200")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total"] == 1
    assert data["jobs"][0]["job_number"] == "B-200"


def test_search_jobs_status_filter(auth_client, app):
    with app.app_context():
        _seed_jobs()

    resp = auth_client.get("/api/jobs/search?q=Client&status=Needs Fieldwork")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total"] == 1
    assert data["jobs"][0]["job_number"] == "C-300"


def test_autocomplete_job_number_prefix(auth_client, app):
    with app.app_context():
        _seed_jobs()

    resp = auth_client.get("/api/jobs/search/autocomplete?q=A-")
    assert resp.status_code == 200
    data = resp.get_json()
    values = [s["value"] for s in data["suggestions"] if s["type"] == "job_number"]
    assert "A-100" in values
