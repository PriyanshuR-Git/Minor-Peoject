import json
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

# COLOR CODES FOR TERMINAL
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
RESET = "\033[0m"

def log(msg, color=BLUE):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"{color}[{ts}] {msg}{RESET}")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIG ---
BATTERY_CAPACITY_AH = 27.0
SERIES_CELLS = 96.0
ML_WEIGHT = 0.35
EPS = 1e-9

# --- LOAD MATLAB MODEL PARAMETERS ---
try:
    with open('model_params.json', 'r') as f:
        params = json.load(f)
    log("Model parameters loaded.", GREEN)
except FileNotFoundError:
    log("ERROR: 'model_params.json' not found.", RED)
    raise SystemExit(1)

# NN WEIGHTS
IW = np.array(params['IW'])
LW = np.array(params['LW'])
b1 = np.array(params['b1']).reshape(-1, 1)
b2 = np.array(params['b2']).reshape(-1, 1)

# SCALING
x_min = np.array(params['x_min']).reshape(-1, 1)
x_max = np.array(params['x_max']).reshape(-1, 1)
y_min = params['y_min']
y_max = params['y_max']

# ---------------------------
# RUN NEURAL NET
# ---------------------------
def run_neural_net_batch(currents, temps, voltages):
    """
    returns list of SOC (%) for each input point
    """
    log(f"Running NN for batch of {len(currents)} points")

    currents = np.array(currents, dtype=float)
    temps = np.array(temps, dtype=float)
    voltages = np.array(voltages, dtype=float)

    cell_voltages = voltages / SERIES_CELLS

    X = np.vstack([currents, temps, cell_voltages])

    # clamp
    X_clamped = np.maximum(x_min, np.minimum(x_max, X))

    denom = (x_max - x_min)
    denom[denom == 0] = EPS
    X_norm = 2.0 * (X_clamped - x_min) / denom - 1.0

    Z = np.tanh(np.dot(IW, X_norm) + b1)
    Y_norm = np.dot(LW, Z) + b2

    # denormalize
    soc_fraction = (Y_norm - (-1.0)) * (y_max - y_min) / (1.0 - (-1.0)) + y_min

    if y_max < 2.0:
        soc_percent = soc_fraction * 100.0
    else:
        soc_percent = soc_fraction

    result = soc_percent.flatten().tolist()
    # clamp 0..100 to be safe
    result = [max(0.0, min(100.0, float(r))) for r in result]

    log(f"NN Output (first 5): {result[:5]}", YELLOW)
    return result

# ---------------------------
# DATA MODELS
# ---------------------------
class InputData(BaseModel):
    current: float
    voltage: float
    temperature: float
    time: Optional[float] = None

class DriveCycleData(BaseModel):
    current: List[float]
    voltage: List[float]
    temperature: List[float]
    time: Optional[List[float]] = None

# ---------------------------
# PHYSICS MODEL (improved)
# ---------------------------
def physics_integrate_soc(currents, times, start_soc):
    """
    Integrate SOC using I*dt / (Ah*3600) * 100.
    Stops immediately if SOC reaches 0 and returns phys_socs truncated and discharge_time.
    currents: iterable of A (use same sign conv. as frontend: positive = discharge)
    times: iterable of seconds (same length as currents) or None -> assume dt=1
    start_soc: starting SOC in percent (0..100)
    Returns: (phys_socs_list, discharge_time_seconds_or_none)
    """
    log(f"Physics integration start SOC: {start_soc:.3f}%", BLUE)
    n = len(currents)
    phys = [float(start_soc)]

    if times is None or len(times) != n:
        log("No valid time array — assuming dt=1s per step.", YELLOW)
        times = list(range(n))

    discharge_time = None

    for i in range(1, n):
        dt = float(times[i] - times[i-1])
        # ΔSOC% = (I (A) * dt (s)) / (Capacity(Ah) * 3600) * 100
        delta_percent = (currents[i-1] * dt) / (BATTERY_CAPACITY_AH * 3600.0) * 100.0
        next_soc = phys[-1] + delta_percent

        # HARD CLAMP and early stop
        if next_soc <= 0.0:
            phys.append(0.0)
            discharge_time = float(times[i])
            log(f"⚠ Battery fully discharged at t = {discharge_time:.3f}s", RED)
            return phys, discharge_time

        if next_soc >= 100.0:
            next_soc = 100.0

        phys.append(max(0.0, min(100.0, next_soc)))

    # never hit zero -> discharge_time is last time
    discharge_time = float(times[-1])
    return phys, discharge_time

# ---------------------------
# ENDPOINTS
# ---------------------------
@app.post("/predict")
async def predict_single(data: InputData):
    log(f"Single prediction request → I={data.current}, V={data.voltage}, T={data.temperature}, t={data.time}", BLUE)
    try:
        nn_result = run_neural_net_batch([data.current], [data.temperature], [data.voltage])
        soc = float(nn_result[0])
        soc = max(0.0, min(100.0, soc))
        log(f"NN SOC Output: {soc:.3f}%", GREEN)
        return {"soc": soc}
    except Exception as e:
        log(f"Error in /predict: {e}", RED)
        return {"soc": None}

@app.post("/simulate")
async def predict_cycle(data: DriveCycleData):
    n = len(data.current)
    log(f"Batch simulation request received ({n} points)", BLUE)
    try:
        if not (len(data.temperature) == n and len(data.voltage) == n):
            log("Input length mismatch (current/temp/voltage). Aborting.", RED)
            return {"soc": [], "discharge_time": None, "total_points": 0}

        times = data.time if (data.time and len(data.time) == n) else None

        # 1) NN predictions
        nn_socs = run_neural_net_batch(data.current, data.temperature, data.voltage)

        # 2) Physics integration: use START_SOC as either NN first point or a fixed start (choose fixed START_SOC for safety)
        START_SOC = nn_socs[0] if (nn_socs and 0 <= nn_socs[0] <= 100) else 100.0
        # If you always want start=100, uncomment next line:
        # START_SOC = 100.0

        phys_socs, discharge_time = physics_integrate_soc(data.current, times, START_SOC)

        # 3) Fusion and enforce stop at zero
        final_socs = []
        for idx in range(len(phys_socs)):
            ph = float(phys_socs[idx])
            ml = float(nn_socs[idx]) if idx < len(nn_socs) else ph
            # If physics says battery dead -> final 0 forever
            if ph <= 0.0:
                final_socs.append(0.0)
                # we don't append further here; physics_integrate_soc already returned truncated list up to 0
                continue
            fused = ML_WEIGHT * ml + (1.0 - ML_WEIGHT) * ph
            fused = max(0.0, min(100.0, fused))
            final_socs.append(fused)

        log(f"Final SOC (first 8): {final_socs[:8]}", GREEN)
        log(f"Simulation complete. Points returned: {len(final_socs)}. discharge_time={discharge_time}", GREEN)

        return {
            "soc": final_socs,
            "discharge_time": discharge_time,
            "total_points": len(final_socs)
        }

    except Exception as e:
        log(f"Error in /simulate: {e}", RED)
        return {"soc": [], "discharge_time": None, "total_points": 0}

if __name__ == "__main__":
    import uvicorn
    log("Starting server on port 8000...", GREEN)
    uvicorn.run(app, host="0.0.0.0", port=8000)
