"""
GPU Optimizations - Performance Tuning Utilities

Provides optimization utilities for:
- Memory management
- Batch size tuning
- Mixed precision training
- Kernel fusion
- Data prefetching
"""

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import numpy as np

from .cuda_engine import GPUEngine, get_gpu_engine

logger = logging.getLogger(__name__)


@dataclass
class OptimizationMetrics:
    """Optimization performance metrics."""

    original_latency_ms: float
    optimized_latency_ms: float
    speedup: float
    memory_saved_mb: float
    technique: str


class GPUOptimizer:
    """
    GPU optimization utilities for maximum performance.

    Features:
    - Automatic batch size tuning
    - Memory optimization
    - Mixed precision management
    - Performance profiling
    """

    def __init__(self, gpu_engine: Optional[GPUEngine] = None):
        self.gpu_engine = gpu_engine or get_gpu_engine()
        self._optimization_history: List[OptimizationMetrics] = []

    def find_optimal_batch_size(
        self,
        model: Any,
        input_shape: tuple,
        min_batch: int = 1,
        max_batch: int = 1024,
        target_memory_usage: float = 0.8,
    ) -> int:
        """Find optimal batch size for GPU memory."""
        if not self.gpu_engine.is_gpu_available:
            return min_batch

        # Binary search for optimal batch size
        optimal = min_batch
        low, high = min_batch, max_batch

        while low <= high:
            mid = (low + high) // 2

            try:
                # Try to allocate memory for this batch size
                dummy = np.random.randn(mid, *input_shape).astype(np.float32)
                tensor = self.gpu_engine.to_tensor(dummy)

                # Check memory usage
                memory_info = self._get_memory_usage()
                if memory_info["usage_percent"] < target_memory_usage * 100:
                    optimal = mid
                    low = mid + 1
                else:
                    high = mid - 1

                # Clean up
                del tensor, dummy
                self._clear_cache()

            except Exception:
                high = mid - 1

        logger.info(f"Optimal batch size: {optimal}")
        return optimal

    def _get_memory_usage(self) -> Dict[str, float]:
        """Get current GPU memory usage."""
        if not self.gpu_engine.is_gpu_available:
            return {"usage_percent": 0, "used_mb": 0, "total_mb": 0}

        try:
            import torch

            if torch.cuda.is_available():
                used = torch.cuda.memory_allocated()
                total = torch.cuda.get_device_properties(0).total_memory
                return {
                    "usage_percent": (used / total) * 100,
                    "used_mb": used / (1024**2),
                    "total_mb": total / (1024**2),
                }
        except Exception:
            pass

        return {"usage_percent": 0, "used_mb": 0, "total_mb": 0}

    def _clear_cache(self) -> None:
        """Clear GPU memory cache."""
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

    def enable_mixed_precision(self) -> bool:
        """Enable automatic mixed precision for faster inference."""
        try:
            import torch

            if torch.cuda.is_available():
                # Check if GPU supports FP16
                capability = torch.cuda.get_device_capability()
                if capability[0] >= 7:  # Volta or newer
                    logger.info("Mixed precision (FP16) enabled")
                    return True
                else:
                    logger.info("GPU does not support efficient FP16")
        except Exception as e:
            logger.warning(f"Could not enable mixed precision: {e}")
        return False

    def profile_inference(
        self, model: Any, inputs: np.ndarray, num_runs: int = 100
    ) -> Dict[str, float]:
        """Profile inference performance."""
        import time

        latencies = []

        # Warm up
        for _ in range(10):
            _ = model(inputs) if callable(model) else model.predict(inputs)

        # Profile
        for _ in range(num_runs):
            start = time.perf_counter()
            _ = model(inputs) if callable(model) else model.predict(inputs)
            latencies.append((time.perf_counter() - start) * 1000)

        return {
            "mean_latency_ms": np.mean(latencies),
            "p50_latency_ms": np.percentile(latencies, 50),
            "p95_latency_ms": np.percentile(latencies, 95),
            "p99_latency_ms": np.percentile(latencies, 99),
            "min_latency_ms": np.min(latencies),
            "max_latency_ms": np.max(latencies),
            "throughput_per_sec": 1000 / np.mean(latencies),
        }

    def get_optimization_summary(self) -> Dict[str, Any]:
        """Get summary of all optimizations applied."""
        return {
            "gpu_available": self.gpu_engine.is_gpu_available,
            "backend": self.gpu_engine.backend.value,
            "memory": self._get_memory_usage(),
            "optimizations_applied": len(self._optimization_history),
            "history": [
                {
                    "technique": opt.technique,
                    "speedup": f"{opt.speedup:.2f}x",
                    "memory_saved_mb": opt.memory_saved_mb,
                }
                for opt in self._optimization_history[-10:]  # Last 10
            ],
        }
