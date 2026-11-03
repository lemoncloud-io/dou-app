package io.chatic.dou.attach.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

class InFlightJobsTest {

    @Test
    fun theFirstCallerStartsTheJobAndALaterOneJoinsIt() {
        val jobs = InFlightJobs<String>()
        val answers = mutableListOf<String>()
        assertTrue(jobs.join("a") { answers.add("first:" + it.getOrThrow()) })
        assertFalse(jobs.join("a") { answers.add("second:" + it.getOrThrow()) })
        assertEquals(1, jobs.count())
        jobs.finish("a", Result.success("done"))
        assertEquals(listOf("first:done", "second:done"), answers)
        assertEquals(0, jobs.count())
    }

    @Test
    fun aFailureReachesEveryWaiter() {
        val jobs = InFlightJobs<String>()
        val errors = mutableListOf<Throwable?>()
        jobs.join("a") { errors.add(it.exceptionOrNull()) }
        jobs.join("a") { errors.add(it.exceptionOrNull()) }
        val failure = IllegalStateException("boom")
        jobs.finish("a", Result.failure(failure))
        assertEquals(listOf<Throwable?>(failure, failure), errors)
    }

    @Test
    fun aFinishedJobIsForgottenSoALaterCallRunsAfresh() {
        val jobs = InFlightJobs<Int>()
        assertTrue(jobs.join("a") { })
        jobs.finish("a", Result.success(1))
        assertTrue("a call after the end starts a new job", jobs.join("a") { })
        jobs.finish("a", Result.success(2))
    }

    @Test
    fun differentKeysRunSeparately() {
        val jobs = InFlightJobs<Int>()
        assertTrue(jobs.join("a") { })
        assertTrue(jobs.join("b") { })
        assertEquals(2, jobs.count())
        jobs.finish("a", Result.success(1))
        assertEquals(1, jobs.count())
        jobs.finish("b", Result.success(1))
    }

    @Test
    fun aWaiterThatThrowsDoesNotStrandTheOthers() {
        val jobs = InFlightJobs<Int>()
        var reached = false
        jobs.join("a") { throw IllegalStateException("the promise was already settled") }
        jobs.join("a") { reached = true }
        jobs.finish("a", Result.success(1))
        assertTrue(reached)
    }

    @Test
    fun finishingAJobThatIsNotRunningDoesNothing() {
        InFlightJobs<Int>().finish("nothing", Result.success(1))
    }

    @Test
    fun exactlyOneOfManyConcurrentCallersStartsTheJob() {
        val jobs = InFlightJobs<Int>()
        val starters = AtomicInteger()
        val answered = AtomicInteger()
        val callers = 16
        val ready = CountDownLatch(callers)
        val go = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(callers)
        repeat(callers) {
            pool.execute {
                ready.countDown()
                go.await()
                if (jobs.join("same") { answered.incrementAndGet() }) starters.incrementAndGet()
            }
        }
        ready.await()
        go.countDown()
        pool.shutdown()
        pool.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)
        assertEquals(1, starters.get())
        jobs.finish("same", Result.success(1))
        assertEquals(callers, answered.get())
    }
}
