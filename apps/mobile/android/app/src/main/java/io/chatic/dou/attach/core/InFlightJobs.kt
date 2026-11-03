package io.chatic.dou.attach.core

/**
 * One running job per key, shared by every caller that asks for it while it runs. `PrepareVideo` keys
 * it by the source file: the web gives up on a conversion after ten minutes and its retry asks again
 * while the first one may still be running, and two conversions of one video would write the same
 * result and poster. The retry waits for the running one and gets its answer; a job that has finished
 * is forgotten, so a later call runs afresh.
 *
 * Plain Kotlin and thread-safe, so JVM tests cover it. The caller that [join]s first starts the work
 * and must [finish] it, whatever happens — a job never finished keeps every later caller waiting.
 */
class InFlightJobs<T> {

    private val waiting = HashMap<String, MutableList<(Result<T>) -> Unit>>()

    /**
     * Registers [waiter] for the job under [key]. True when no job was running: the caller starts it
     * and calls [finish] with its outcome. False when one was: [waiter] is called with that outcome.
     */
    @Synchronized
    fun join(key: String, waiter: (Result<T>) -> Unit): Boolean {
        val list = waiting[key]
        if (list != null) {
            list.add(waiter)
            return false
        }
        waiting[key] = mutableListOf(waiter)
        return true
    }

    /** Ends the job under [key], handing [result] to every waiter in the order they joined. */
    fun finish(key: String, result: Result<T>) {
        val waiters = synchronized(this) { waiting.remove(key) } ?: return
        for (waiter in waiters) {
            try {
                waiter(result)
            } catch (e: Exception) {
                // One waiter that cannot be answered must not leave the others waiting.
            }
        }
    }

    /** How many jobs are running, for tests. */
    @Synchronized
    fun count(): Int = waiting.size
}
