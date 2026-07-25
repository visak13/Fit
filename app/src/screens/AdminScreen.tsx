/**
 * ADMIN — and, for now, the only screen with real content: THIS DEVICE'S OWN RECORD.
 *
 * It shows which build is running and exactly what the browser answered when asked to persist
 * storage, including the case where it refused, where it is unsupported, and where the request
 * failed. It states the literal value rather than a friendly interpretation of it, because the
 * value is the evidence and an interpretation is not.
 *
 * The warning below the answer is not decoration. A granted persistence is routinely read as "my
 * data is safe now", and it is not: removing the installed icon or clearing site data still
 * destroys everything held on the device.
 */

import { PERSISTENCE_IS_NOT_IMMUNITY } from '../platform/storage-persistence';
import type { PersistenceRecord } from '../platform/storage-persistence';
import { usePlatformStatus } from '../platform/platform-status';
import type { Destination } from '../shell/navigation';

const BYTES_PER_GIGABYTE = 1024 ** 3;

function describeBytes(bytes: number | null): string {
  if (bytes === null) return 'not reported';
  return `${(bytes / BYTES_PER_GIGABYTE).toFixed(2)} GB (${bytes} bytes)`;
}

/**
 * The answer in words, without ever replacing the literal value shown beside it.
 */
function describeAnswer(record: PersistenceRecord): string {
  if (!record.supported) return 'this browser cannot be asked';
  if (record.failure !== null) return 'the request failed';
  if (record.literalAnswer === true) return 'granted';
  if (record.literalAnswer === false) return 'refused';
  return 'no answer was reached';
}

function PersistenceReport({ record }: { record: PersistenceRecord | null }) {
  if (record === null) {
    return <p>The persistence request has not completed yet.</p>;
  }

  return (
    <>
      <p>
        Persistent storage: <strong>{describeAnswer(record)}</strong>
      </p>
      <dl>
        <dt>Literal answer from the browser</dt>
        <dd>
          <code>{JSON.stringify(record.literalAnswer)}</code> (type{' '}
          <code>{record.literalAnswerType}</code>)
        </dd>

        <dt>Already persisted before asking</dt>
        <dd>
          <code>{JSON.stringify(record.alreadyPersisted)}</code>
        </dd>

        <dt>Asked at</dt>
        <dd>{record.askedAt}</dd>

        <dt>Storage available</dt>
        <dd>{describeBytes(record.quotaBytes)}</dd>

        <dt>Storage used</dt>
        <dd>{describeBytes(record.usageBytes)}</dd>

        {record.failure !== null && (
          <>
            <dt>Failure</dt>
            <dd>{record.failure}</dd>
          </>
        )}
      </dl>
      <p role="note">{PERSISTENCE_IS_NOT_IMMUNITY}</p>
    </>
  );
}

export function AdminScreen({ destination }: { destination: Destination }) {
  const { buildStamp, persistence, offlineStart } = usePlatformStatus();

  return (
    <section aria-labelledby="screen-admin">
      <h2 id="screen-admin">{destination.label}</h2>
      <p>{destination.summary}</p>

      <h3>This device</h3>
      <PersistenceReport record={persistence} />

      <h3>This build</h3>
      <dl>
        <dt>Build</dt>
        <dd>
          <code>{buildStamp}</code>
        </dd>

        <dt>Starts without a network</dt>
        <dd>
          {offlineStart.registered
            ? 'yes — the offline worker is registered'
            : `no — ${offlineStart.reason ?? 'the offline worker was not registered'}`}
        </dd>
      </dl>

      <p>
        <small>
          The build value identifies the source this application was built from. If it does not
          match what the repository says was published, the site is serving an older build.
        </small>
      </p>
    </section>
  );
}
