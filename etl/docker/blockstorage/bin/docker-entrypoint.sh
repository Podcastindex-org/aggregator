#!/bin/sh
#
# MinIO Cloud Storage, (C) 2019 MinIO, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

# If command starts with an option, prepend minio.
if [ "${1}" != "minio" ]; then
    if [ -n "${1}" ]; then
        set -- minio "$@"
    fi
fi

## Set docker secrets to dummy variables
docker_secrets_env() {
    MINIO_ACCESS_KEY="podcastindex"
    export MINIO_ACCESS_KEY

    MINIO_SECRET_KEY="podcastindex"
    export MINIO_SECRET_KEY
}

# su-exec to requested user, if service cannot run exec will fail.
docker_switch_user() {
    if [ ! -z "${MINIO_USERNAME}" ] && [ ! -z "${MINIO_GROUPNAME}" ]; then

	if [ ! -z "${MINIO_UID}" ] && [ ! -z "${MINIO_GID}" ]; then
		addgroup -S -g "$MINIO_GID" "$MINIO_GROUPNAME" && \
                        adduser -S -u "$MINIO_UID" -G "$MINIO_GROUPNAME" "$MINIO_USERNAME"
	else
		addgroup -S "$MINIO_GROUPNAME" && \
                	adduser -S -G "$MINIO_GROUPNAME" "$MINIO_USERNAME"
	fi

        exec su-exec "${MINIO_USERNAME}:${MINIO_GROUPNAME}" "$@"
    else
        # fallback
        exec "$@"
    fi
}

## Set access env
docker_secrets_env

## Switch to user if applicable.
docker_switch_user "$@"