// EVDashboard.jsx - EV Battery Digital Twin Simulator (Professional & Modern UI)
import { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Battery, Zap, Thermometer, Activity, Gauge, 
    AlertTriangle, CheckCircle, PlayCircle, StopCircle, 
    ChevronUp, ChevronDown, Clock, TrendingUp, TrendingDown, Layers, Power, Loader 
} from 'lucide-react';

// --- CONFIGURATION CONSTANTS (Tuned for 20s Sim) ---
const BATTERY_CAPACITY_AH = 27; // Amp-hours
const NOMINAL_VOLTAGE = 400; // Volts (high-level)
const MAX_DISCHARGE_CURRENT = 300; // Amps (absolute max discharge)
const MAX_CHARGE_CURRENT = 100; // Amps (max regen/charge)
const R_INTERNAL = 0.05; // Internal resistance (Ohms)
const SOC_TO_RANGE_FACTOR = 3.8; // km per % SOC
const SIMULATION_DURATION = 20; // seconds (REAL TIME)
const REFERENCE_SOC = 80; // Starting SOC for DOD calculation

// --- UTILITY: Simplified Physics/ML Models (Logic kept same as previous request) ---

const calculateCurrent = (throttle, isBraking, regenBraking, speed, maxDischarge, maxCharge) => {
    let current = -1; 
    
    if (throttle > 0 && !isBraking) {
        current += -1 * (throttle / 100) * maxDischarge;
    }
    
    if (isBraking) {
        const speedFactor = Math.min(1, speed / 100); 
        // Increased regen factor: 1.2
        const regenFactor = (regenBraking / 100) * 1.2; 
        
        let chargeCurrent = speedFactor * regenFactor * maxCharge;

        current += chargeCurrent;
    }
    
    return current;
};

const calculateVoltage = (soc, current, nominalVoltage, rInternal) => {
    const ocv = nominalVoltage * (0.9 + (soc / 100) * 0.2); 
    const irDrop = -1 * current * rInternal; 
    const noise = (Math.random() - 0.5) * 0.1;
    return ocv + irDrop + noise;
};

const calculateTemperatureChange = (current, temp, ambientTemp, rInternal, coolingRate, physicsDeltaTime) => {
    const heatGenRate = (current ** 2 * rInternal) * 0.0005; 
    const coolingFactor = 0.05 + (coolingRate / 100) * 0.3; 
    const heatDissipationRate = (temp - ambientTemp) * coolingFactor;
    const netChangeRate = heatGenRate - heatDissipationRate;
    return netChangeRate * physicsDeltaTime; 
};

const calculateSOHDegradation = (soh, soc, temp, current, deltaTime, timeWarp) => {
    const effectiveTime = deltaTime * timeWarp; 
    const calendarPenalty = 
        (soc > 80 ? (soc - 80) * 0.00001 : 0) + 
        (soc < 20 ? (20 - soc) * 0.00001 : 0);
    const tempPenalty = temp > 40 ? (temp - 40) * 0.00002 : 0;
    const currentPenalty = Math.abs(current) * 0.000005;
    const totalDegradation = (calendarPenalty + tempPenalty + currentPenalty) * effectiveTime;
    return Math.max(0, soh - totalDegradation); 
};

// =================================================================
// EVDashboard Component
// =================================================================

function EVDashboard() {
    // --- SIMULATION MODE & TIMERS ---
    const [isSimulating, setIsSimulating] = useState(false);
    const [timer, setTimer] = useState(SIMULATION_DURATION);

    // --- CONTROLS ---
    const [throttle, setThrottle] = useState(0);
    const [isBraking, setIsBraking] = useState(false); 
    const [regenBraking, setRegenBraking] = useState(50);
    const [ambientTemp] = useState(25);
    const [grade, setGrade] = useState(0); 
    const [coolingRate, setCoolingRate] = useState(50); 
    const [timeWarp, setTimeWarp] = useState(1); 

    // --- UI STATE: DISPLAY & HISTORY ---
    const [vehicleSpeed, setVehicleSpeed] = useState(0);
    const [batteryCurrent, setBatteryCurrent] = useState(0);
    const [batteryVoltage, setBatteryVoltage] = useState(NOMINAL_VOLTAGE);
    const [batteryTemp, setBatteryTemp] = useState(ambientTemp);
    const [soc, setSoc] = useState(REFERENCE_SOC); 
    const [soh, setSoh] = useState(100); 
    const [dod, setDod] = useState(0); 
    const [cycleLife, setCycleLife] = useState(0); 

    const HISTORY_LENGTH = 50;
    const [currentHistory, setCurrentHistory] = useState(Array(HISTORY_LENGTH).fill(0));
    const [socHistory, setSocHistory] = useState(Array(HISTORY_LENGTH).fill(REFERENCE_SOC));
    const [sohHistory, setSohHistory] = useState(Array(HISTORY_LENGTH).fill(100));

    // --- WARNINGS (SAFETY LIMITS) ---
    const [isOverCurrent, setIsOverCurrent] = useState(false);
    const [isOverVoltage, setIsOverVoltage] = useState(false);
    const [isOverTemp, setIsOverTemp] = useState(false);
    const OVER_CURRENT_LIMIT = 250;
    const OVER_VOLTAGE_LIMIT = NOMINAL_VOLTAGE * 1.1; 
    const OVER_TEMP_LIMIT = 50;

    // --- SIMULATION MEMORY & LOGGING ---
    const socRef = useRef(REFERENCE_SOC);
    const sohRef = useRef(100);
    const tempRef = useRef(ambientTemp);
    const currentRef = useRef(0);
    const speedRef = useRef(0);
    const chargedAhRef = useRef(0); 
    const dischargedAhRef = useRef(0); 
    const telemetryDataRef = useRef([]);
    const animationRef = useRef(null);
    const simStartTimeRef = useRef(null); 
    const lastTimeRef = useRef(Date.now());
    const lastApiCallTimeRef = useRef(0);

    // =================================================================
    // START/STOP Logic (Unchanged)
    // =================================================================
    const handleDownloadCSV = (data) => {
        if (data.length === 0) {
            alert("Simulation completed, but no data was logged. Please ensure the simulation ran for more than 0.1 seconds.");
            return;
        }

        const headers = ["Time_s", "Voltage_V", "Current_A", "Temperature_C", "Speed_kmh", "SOC_Actual_pct", "SOC_Model_pct", "SOC_Error_pct", "SOH_Actual_pct", "SOH_Model_pct", "SOH_Error_pct"];
        
        const csvRows = data.map(row => 
            [
                row.time.toFixed(3), row.voltage.toFixed(4), row.current.toFixed(2), 
                row.temp.toFixed(2), row.speed.toFixed(1), 
                row.socActual.toFixed(4), row.socModel.toFixed(4), row.socError.toFixed(4), 
                row.sohActual.toFixed(4), row.sohModel.toFixed(4), row.sohError.toFixed(4)
            ].join(',')
        );

        const csvContent = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.setAttribute("href", url);
        link.setAttribute("download", `Battery_Model_Output_EV_Simulation_Data_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        alert(`✅ Simulation Data CSV downloaded!\n\nFilename: Battery_Model_Output_EV_Simulation_Data_${timestamp}.csv`);
    };

    const startSimulation = () => {
        telemetryDataRef.current = [];
        setIsSimulating(true);
        setTimer(SIMULATION_DURATION);
        simStartTimeRef.current = Date.now();
        
        socRef.current = REFERENCE_SOC;
        sohRef.current = 100;
        tempRef.current = ambientTemp;
        currentRef.current = 0;
        speedRef.current = 0;
        chargedAhRef.current = 0;
        dischargedAhRef.current = 0;
        setSoc(REFERENCE_SOC);
        setSoh(100);
        setBatteryTemp(ambientTemp);
        setVehicleSpeed(0);
        setDod(0);
        setCycleLife(0);
        
        setIsOverCurrent(false);
        setIsOverVoltage(false);
        setIsOverTemp(false);
        setCurrentHistory(Array(HISTORY_LENGTH).fill(0));
        setSocHistory(Array(HISTORY_LENGTH).fill(REFERENCE_SOC));
        setSohHistory(Array(HISTORY_LENGTH).fill(100));
    };

    const stopSimulation = () => {
        if (!isSimulating) return; 
        
        setIsSimulating(false);
        setTimer(0);
        setThrottle(0);
        setIsBraking(false);
        setVehicleSpeed(0);

        handleDownloadCSV(telemetryDataRef.current); 
        setSoc(socRef.current);
    };

    useEffect(() => {
        if (!isSimulating) return;
        const timerId = setInterval(() => {
            const elapsedTime = (Date.now() - simStartTimeRef.current) / 1000;
            const remainingTime = Math.max(0, SIMULATION_DURATION - elapsedTime);
            setTimer(remainingTime);
            if (remainingTime <= 0) {
                setTimeout(stopSimulation, 50); 
            }
        }, 100); 
        return () => clearInterval(timerId);
    }, [isSimulating]);
    
    useEffect(() => {
        if (isBraking) {
            setThrottle(0);
        }
    }, [isBraking]);

    // =================================================================
    // MAIN SIMULATION LOOP (Unchanged)
    // =================================================================
    useEffect(() => {
        const loop = () => {
            const now = Date.now();
            const deltaTime = (now - lastTimeRef.current) / 1000;
            lastTimeRef.current = now;

            const physicsDeltaTime = deltaTime * timeWarp;

            if (isSimulating) {
                
                // 1. CURRENT CALCULATION
                let currentForPhysics = calculateCurrent(
                    throttle, isBraking, regenBraking, speedRef.current, 
                    MAX_DISCHARGE_CURRENT, MAX_CHARGE_CURRENT
                );
                const gradeEffect = grade * 0.1; 
                currentForPhysics -= gradeEffect * 10;
                currentRef.current = currentRef.current + (currentForPhysics - currentRef.current) * 0.1;

                // 2. SOC, DOD, CYCLE LIFE
                const currentAh = currentRef.current * (physicsDeltaTime / 3600);
                socRef.current = Math.max(0, Math.min(100, socRef.current + currentAh / BATTERY_CAPACITY_AH * 100));
                const newDod = Math.abs(socRef.current - REFERENCE_SOC);
                
                if (currentRef.current > 0) {
                    chargedAhRef.current += currentAh;
                } else {
                    dischargedAhRef.current += Math.abs(currentAh);
                }
                const totalAhCycled = (chargedAhRef.current + dischargedAhRef.current) / 2;
                const newCycleLife = totalAhCycled / BATTERY_CAPACITY_AH;
                
                // 3. VOLTAGE, TEMP, SOH
                const simulatedVoltage = calculateVoltage(socRef.current, currentRef.current, NOMINAL_VOLTAGE, R_INTERNAL);
                const tempChange = calculateTemperatureChange(currentRef.current, tempRef.current, ambientTemp, R_INTERNAL, coolingRate, physicsDeltaTime);
                tempRef.current = Math.max(ambientTemp, tempRef.current + tempChange);
                sohRef.current = calculateSOHDegradation(sohRef.current, socRef.current, tempRef.current, currentRef.current, deltaTime, timeWarp); 

                // 4. VEHICLE SPEED/MOVEMENT PHYSICS
                const maxSpeed = 160; 
                let targetSpeed;
                
                if (throttle > 0 && !isBraking) {
                    targetSpeed = throttle / 100 * maxSpeed;
                } else if (isBraking) {
                    targetSpeed = Math.max(0, speedRef.current * (1 - 0.2 * physicsDeltaTime)); 
                } else {
                    targetSpeed = Math.max(0, speedRef.current * (1 - 0.05 * physicsDeltaTime)); 
                }
                speedRef.current = speedRef.current + (targetSpeed - speedRef.current) * 0.08 * physicsDeltaTime;
                speedRef.current = Math.max(0, speedRef.current - gradeEffect * 0.5 * physicsDeltaTime);
                setVehicleSpeed(speedRef.current);

                // 5. UI STATE UPDATES & DATA LOGGING (at fixed rate)
                if (now - lastApiCallTimeRef.current > 100) { 
                    lastApiCallTimeRef.current = now;

                    // Simulated Model Data (Kept for CSV export consistency)
                    const socNoise = (Math.random() * 0.2 - 0.1); 
                    const sohNoise = (Math.random() * 0.05 - 0.025); 
                    const simulatedSocModel = Math.max(0, Math.min(100, socRef.current + socNoise));
                    const simulatedSohModel = Math.max(0, Math.min(100, sohRef.current + sohNoise));
                    const calculatedSocError = Math.abs(socRef.current - simulatedSocModel);
                    const calculatedSohError = Math.abs(sohRef.current - simulatedSohModel);
                    const elapsedTime = (now - simStartTimeRef.current) / 1000;
                    
                    // --- LOG CURRENT STATE ---
                    telemetryDataRef.current.push({
                        time: elapsedTime, voltage: simulatedVoltage, current: currentRef.current, 
                        temp: tempRef.current, speed: speedRef.current, socActual: socRef.current, 
                        sohActual: sohRef.current, socModel: simulatedSocModel, sohModel: simulatedSohModel, 
                        socError: calculatedSocError, sohError: calculatedSohError
                    });
                    // --- END LOGGING ---

                    setBatteryCurrent(currentRef.current);
                    setBatteryVoltage(simulatedVoltage);
                    setBatteryTemp(tempRef.current);
                    setSoc(socRef.current);
                    setSoh(sohRef.current);
                    setDod(newDod);
                    setCycleLife(newCycleLife);
                    
                    setCurrentHistory(p => [...p.slice(1), currentRef.current]);
                    setSocHistory(p => [...p.slice(1), socRef.current]);
                    setSohHistory(p => [...p.slice(1), sohRef.current]);

                    // 6. WARNING CHECKS
                    setIsOverCurrent(Math.abs(currentRef.current) > OVER_CURRENT_LIMIT);
                    setIsOverVoltage(simulatedVoltage > OVER_VOLTAGE_LIMIT);
                    setIsOverTemp(tempRef.current > OVER_TEMP_LIMIT);

                    if (tempRef.current > OVER_TEMP_LIMIT && coolingRate < 100) {
                        setCoolingRate(p => Math.min(100, p + 5));
                    }
                }
                
                if (socRef.current <= 0.1) {
                    stopSimulation();
                    socRef.current = 0;
                    setSoc(0);
                }
            }

            animationRef.current = requestAnimationFrame(loop);
        };
        
        lastTimeRef.current = Date.now();
        animationRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animationRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSimulating, ambientTemp, coolingRate, grade, regenBraking, throttle, isBraking, timeWarp]);

    // --- CHART COMPONENT (Refined Style and Consistency) ---
    const LineChart = ({ data, color, min, max, unit }) => {
        const autoMin = min !== undefined ? min : Math.floor(Math.min(...data));
        const autoMax = max !== undefined ? max : Math.ceil(Math.max(...data));
        const width = 250, height = 100; // Increased size for consistency
        const getPath = (dataset) => {
            if (!dataset.length) return '';
            return 'M ' + dataset.map((v, i) => {
                const x = (i / (dataset.length - 1)) * width;
                const y = height - ((v - autoMin) / (autoMax - autoMin || 1)) * height;
                return `${x},${y}`;
            }).join(' L ');
        };
        return (
            <div className="relative h-28 w-full mt-2">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <path d={getPath(data)} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>{autoMin.toFixed(0)}{unit}</span>
                    <span>{autoMax.toFixed(0)}{unit}</span>
                </div>
            </div>
        );
    };

    // --- NEW METRIC CARD COMPONENT for Consistency ---
    const MetricCard = ({ title, value, unit, colorClass, icon: Icon, data, min, max }) => (
        <div className="bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700 h-full flex flex-col justify-between">
            <div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-400 mb-1">
                    <Icon size={16} className={`text-${colorClass.split('-')[1]}-400`} />
                    {title}
                </div>
                <div className={`text-4xl font-extrabold ${colorClass} leading-tight`}>
                    {value}
                    <span className="text-sm font-semibold text-slate-400 ml-1">{unit}</span>
                </div>
            </div>
            
            {(data && data.length > 0) && (
                <LineChart data={data} color={`#${colorClass.includes('green') ? '10b981' : colorClass.includes('indigo') ? '6366f1' : colorClass.includes('yellow') ? 'f59e0b' : 'ef4444'}`} min={min} max={max} unit={unit} />
            )}
        </div>
    );

    const ControlSlider = ({ label, val, setVal, icon: Icon, disabled, min = 0, max = 100, unit = '%' }) => (
        <div className={`bg-slate-700 p-4 rounded-xl shadow-md border border-slate-600 transition-opacity ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex justify-between mb-2">
                <span className="flex items-center gap-2 font-medium text-slate-300">
                    <Icon size={16} className="text-indigo-400" /> {label}
                </span>
                <span className="font-bold text-white">{val}{unit}</span>
            </div>
            <input 
                type="range" 
                min={min} 
                max={max} 
                value={val} 
                onChange={e => setVal(Number(e.target.value))} 
                className="w-full h-2 bg-slate-500 rounded-lg appearance-none cursor-pointer" 
            />
        </div>
    );

    const ControlButton = ({ label, icon: Icon, active, onMouseDown, onMouseUp, disabled }) => (
        <button 
            onMouseDown={onMouseDown} 
            onMouseUp={onMouseUp} 
            onTouchStart={onMouseDown}
            onTouchEnd={onMouseUp}
            disabled={disabled}
            className={`w-full p-4 rounded-xl border shadow-sm transition-all flex items-center justify-center gap-2 text-lg font-bold ${
                active ? 'bg-red-500 text-white border-red-600 shadow-xl scale-105' : 
                         'bg-slate-700 text-red-400 border-slate-600 hover:bg-slate-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            <Icon size={20} /> {label}
        </button>
    );

    const WarningCard = ({ label, isTriggered, limit, unit }) => (
        <div className={`p-3 rounded-xl shadow-md transition-colors flex flex-col items-center justify-center text-center ${
            isTriggered ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-600 text-green-300'
        }`}>
            {isTriggered ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
            <div className="font-bold text-sm mt-1">{label}</div>
            <div className="text-xs text-slate-200">{isTriggered ? `Limit: >${limit}${unit}` : 'Nominal'}</div>
        </div>
    );
    
    // --- Determine SOC Color ---
    const getSocColor = (soc) => {
        if (soc >= 80) return 'text-green-400';
        if (soc >= 50) return 'text-indigo-400';
        if (soc >= 10) return 'text-yellow-400';
        return 'text-red-400';
    };

    // --- Determine Current Flow Color ---
    const getCurrentColor = (current) => {
        if (current > 5) return 'text-green-400'; // Charging
        if (current < -5) return 'text-red-400'; // Discharging (High Draw)
        return 'text-indigo-400'; // Idle/Low
    };

    return (
        <div className="min-h-screen bg-slate-900 p-6 font-sans text-white">
            <div className="max-w-7xl mx-auto space-y-6">
                
                {/* Header & Status (Minimalist Dark Header) */}
                <div className="flex flex-col md:flex-row justify-between items-center bg-slate-800 p-6 rounded-xl shadow-2xl border border-slate-700">
                    <div>
                        <h1 className="text-3xl font-light flex items-center gap-3 text-indigo-400">
                            <Battery className="text-indigo-400" fill="currentColor" size={30} /> 
                            EV Battery Digital Twin Simulator
                        </h1>
                        <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
                            <span className={`flex items-center gap-1 px-3 py-1 rounded-full font-semibold ${isSimulating ? 'bg-yellow-800 text-yellow-300' : 'bg-green-800 text-green-300'}`}>
                                <Loader size={14}/> 
                                {isSimulating ? `RUNNING: ${timer.toFixed(1)}s LEFT` : "STANDBY"}
                            </span>
                            <span className="font-bold">PHYSICS WARP: {timeWarp}x</span>
                        </div>
                    </div>
                    
                    {/* Controls */}
                    <div className="flex gap-3 mt-4 md:mt-0">
                        {!isSimulating ? (
                            <button onClick={startSimulation} className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg">
                                <PlayCircle size={20}/> Start Simulation
                            </button>
                        ) : (
                            <button onClick={stopSimulation} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg">
                                <StopCircle size={20}/> Stop & Download Data
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Grid Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Column 1: Controls (3/12) - Dark background for control panel */}
                    <div className="lg:col-span-3 space-y-4">
                        <div className="text-xl font-medium text-slate-300 flex items-center gap-2"><Gauge size={20} className="text-indigo-400"/> Vehicle Controls</div>
                        <ControlSlider 
                            label="Throttle (Acceleration)" 
                            val={throttle} 
                            setVal={setThrottle} 
                            icon={TrendingUp} 
                            disabled={!isSimulating || isBraking} 
                        />
                        <ControlButton 
                            label="Brake Pedal" 
                            icon={TrendingDown} 
                            active={isBraking} 
                            onMouseDown={() => setIsBraking(true)} 
                            onMouseUp={() => setIsBraking(false)} 
                            onTouchStart={() => setIsBraking(true)} 
                            onTouchEnd={() => setIsBraking(false)} 
                            disabled={!isSimulating}
                        />
                        <ControlSlider 
                            label="Regen Braking Level" 
                            val={regenBraking} 
                            setVal={setRegenBraking} 
                            icon={Zap} 
                            disabled={!isSimulating} 
                        />
                        
                        <hr className="my-4 border-slate-700"/>
                        <div className="text-xl font-medium text-slate-300 flex items-center gap-2"><Layers size={20} className="text-indigo-400"/> Environment Settings</div>
                        <ControlSlider 
                            label="Road Grade (Inclination)" 
                            val={grade} 
                            setVal={setGrade} 
                            icon={grade > 0 ? ChevronUp : ChevronDown} 
                            min={-10} max={10} unit="°"
                            disabled={!isSimulating} 
                        />
                        <ControlSlider 
                            label="Active Cooling Rate" 
                            val={coolingRate} 
                            setVal={setCoolingRate} 
                            icon={Thermometer} 
                            disabled={!isSimulating} 
                        />
                         <ControlSlider 
                            label="Time Warp (Speed)" 
                            val={timeWarp} 
                            setVal={setTimeWarp} 
                            icon={Clock} 
                            min={1} max={100} unit="x"
                            disabled={isSimulating} 
                        />
                    </div>

                    {/* Column 2: Dashboard Metrics & Graphs (6/12) */}
                    <div className="lg:col-span-6 space-y-6">
                        
                        {/* Vehicle Speed (Medium Size, Consistent placement) */}
                        <div className="bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700 text-center">
                            <div className="text-xl text-slate-400 mb-1">Vehicle Speed</div>
                            <div className="text-6xl font-extrabold text-indigo-400">
                                {vehicleSpeed.toFixed(0)}
                            </div>
                            <div className="text-xl text-slate-400">km/h</div>
                        </div>

                        {/* Core Metrics Grid with Graphs (Consistent Sizing for Professional Look) */}
                        <div className="grid grid-cols-3 gap-6 h-96">
                            
                            {/* SOC with Graph */}
                            <MetricCard
                                title="State of Charge (SOC)"
                                value={soc.toFixed(1)}
                                unit="%"
                                colorClass={getSocColor(soc)}
                                icon={Battery}
                                data={socHistory}
                                min={0} max={100}
                            />

                            {/* SOH with Graph */}
                            <MetricCard
                                title="State of Health (SOH)"
                                value={soh.toFixed(2)}
                                unit="%"
                                colorClass="text-yellow-400"
                                icon={Layers}
                                data={sohHistory}
                                min={95} max={100}
                            />

                            {/* Current with Graph */}
                            <MetricCard
                                title="Current Flow (Real-Time)"
                                value={batteryCurrent.toFixed(1)}
                                unit="A"
                                colorClass={getCurrentColor(batteryCurrent)}
                                icon={Power}
                                data={currentHistory}
                                min={-MAX_DISCHARGE_CURRENT} max={MAX_CHARGE_CURRENT}
                            />
                        </div>

                        {/* Voltage and Temp (No Graphs, Consistent Sizing) */}
                        <div className="grid grid-cols-2 gap-6">
                            {/* Voltage */}
                            <MetricCard
                                title="Battery Voltage"
                                value={batteryVoltage.toFixed(2)}
                                unit="V"
                                colorClass="text-indigo-400"
                                icon={Zap}
                            />
                            
                            {/* Temperature */}
                            <MetricCard
                                title="Battery Temperature"
                                value={batteryTemp.toFixed(1)}
                                unit="°C"
                                colorClass={batteryTemp > OVER_TEMP_LIMIT ? 'text-red-400' : 'text-green-400'}
                                icon={Thermometer}
                            />
                        </div>
                    </div>
                    
                    {/* Column 3: Warnings (3/12) */}
                    <div className="lg:col-span-3 space-y-4">
                        <div className="text-xl font-medium text-slate-300 flex items-center gap-2"><AlertTriangle size={20} className="text-red-400"/> Safety Warnings</div>
                        <div className="grid grid-cols-1 gap-4">
                            <WarningCard 
                                label="Over-Current" 
                                isTriggered={isOverCurrent} 
                                limit={OVER_CURRENT_LIMIT} 
                                unit="A" 
                            />
                            <WarningCard 
                                label="Over-Voltage" 
                                isTriggered={isOverVoltage} 
                                limit={OVER_VOLTAGE_LIMIT.toFixed(0)} 
                                unit="V" 
                            />
                            <WarningCard 
                                label="Over-Temperature" 
                                isTriggered={isOverTemp} 
                                limit={OVER_TEMP_LIMIT} 
                                unit="°C" 
                            />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default EVDashboard;