import argparse
import base64
import json
import os
import time
import uuid
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree
from zipfile import ZIP_DEFLATED, ZipFile


PORTAL = "https://central.sonatype.com/api/v1/publisher"


def make_bundle(repository, project):
    poms = sorted(repository.rglob("*.pom"))
    coordinates = []
    for pom in poms:
        model = ElementTree.parse(pom).getroot()
        coordinates.append(tuple(model.findtext(f"{{*}}{key}") for key in ("groupId", "artifactId", "version")))
    group_versions = {(group, version) for group, _, version in coordinates}
    if len(group_versions) != 1 or project not in {artifact for _, artifact, _ in coordinates}:
        raise ValueError("Expected one staged group and version containing the deployment's project")
    _, version = next(iter(group_versions))
    if not version or version.endswith("-SNAPSHOT"):
        raise ValueError("Expected a staged Maven release version")

    bundle = BytesIO()
    with ZipFile(bundle, "w", compression=ZIP_DEFLATED) as archive:
        for directory in sorted({pom.parent for pom in poms}):
            files = sorted(file for file in directory.iterdir() if file.is_file())
            for file in files:
                if file.suffix in (".aar", ".jar", ".module", ".pom", ".zip"):
                    for suffix in (".asc", ".md5", ".sha1"):
                        if not file.with_name(file.name + suffix).is_file():
                            raise ValueError(f"Missing {file.name}{suffix} in the staged release")
                if not file.name.startswith("maven-metadata"):
                    archive.write(file, file.relative_to(repository).as_posix())
    return f"{project}-{version}", bundle.getvalue()


def portal_request(endpoint, parameters, authorization, data=b"", content_type=None):
    request = Request(f"{PORTAL}/{endpoint}?{urlencode(parameters)}", data=data)
    request.add_unredirected_header("Authorization", authorization)
    if content_type:
        request.add_header("Content-Type", content_type)
    with urlopen(request, timeout=60) as response:
        return response.read()


def publish(name, bundle, authorization):
    boundary = uuid.uuid4().hex
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="bundle"; filename="central-bundle.zip"\r\n'
        'Content-Type: application/octet-stream\r\n\r\n'
    ).encode() + bundle + f"\r\n--{boundary}--\r\n".encode()
    deployment = portal_request(
        "upload", {"name": name, "publishingType": "AUTOMATIC"}, authorization,
        body, f"multipart/form-data; boundary={boundary}",
    ).decode().strip()
    uuid.UUID(deployment)
    print(f"Uploaded {name} as deployment {deployment}", flush=True)

    deadline = time.monotonic() + 3600
    previous_state = None
    while time.monotonic() < deadline:
        try:
            status = json.loads(portal_request("status", {"id": deployment}, authorization))
        except HTTPError as error:
            if error.code != 429 and not 500 <= error.code < 600:
                raise
        except (URLError, TimeoutError):
            pass
        else:
            state = status["deploymentState"]
            if state != previous_state:
                print(f"{name}: {state}", flush=True)
                previous_state = state
            if state == "PUBLISHED":
                return
            if state == "FAILED":
                raise RuntimeError(f"Deployment {deployment} failed: {json.dumps(status.get('errors', {}))}")
        time.sleep(10)
    raise TimeoutError(f"Timed out waiting for deployment {deployment} to publish")


def main():
    parser = argparse.ArgumentParser(description="Publish a signed Maven repository to Central")
    parser.add_argument("repository", type=Path)
    parser.add_argument("project")
    args = parser.parse_args()

    username = os.environ.get("MAVEN_CENTRAL_USERNAME")
    password = os.environ.get("MAVEN_CENTRAL_PASSWORD")
    if not username or not password:
        parser.error("MAVEN_CENTRAL_USERNAME and MAVEN_CENTRAL_PASSWORD are required")
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    name, bundle = make_bundle(args.repository, args.project)
    publish(name, bundle, f"Bearer {token}")


if __name__ == "__main__":
    main()
