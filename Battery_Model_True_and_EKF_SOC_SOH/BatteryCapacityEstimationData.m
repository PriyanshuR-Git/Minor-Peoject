%% Parameters for Estimate Battery State of Health Based on Capacity Fade
% 
% This example shows how to estimate the battery capacity and 
% state of health (SOH) by using a Kalman filter. The initial state of 
% charge (SOC) of the battery is equal to 0.5. The estimator uses 
% an initial condition for the SOC equal to 0.8. The battery keeps 
% charging and discharging for 50 hours. The example estimates the battery 
% capacity, in ampere-hour, and the SOC by using an extended Kalman Filter. 
% The estimation error for the battery capacity is less than 4%. The SOC 
% is estimated using an extended Kalman filter. When using fixed capacity 
% the estimated SOC value diverges from the true value. To demonstrate the
% functionality of the estimator and to restrict the duration of the 
% simulation, this example models an increased capacity fade rate.

% Copyright 2023 The MathWorks, Inc.

%% System Parameters
SOC_vec = [0, .1, .25, .5, .75, .9, 1]; % Vector of state-of-charge values, SOC
T_vec   = [278, 293, 313];              % Vector of temperatures, T, (K)
AH      = 27;                           % Cell capacity, AH, (A*hr) 
thermal_mass = 150;                     % Thermal mass (J/K)
initialSOC = 0.5;                       % Battery initial SOC
V0_mat  = [3.49, 3.5, 3.51; 3.55, 3.57, 3.56; 3.62, 3.63, 3.64;...
    3.71, 3.71, 3.72; 3.91, 3.93, 3.94; 4.07, 4.08, 4.08;...
    4.19, 4.19, 4.19];                          % Open-circuit voltage, V0(SOC,T), (V)
R0_mat  = [.0117, .0085, .009; .011, .0085, .009;...
    .0114, .0087, .0092; .0107, .0082, .0088; .0107, .0083, .0091;...
    .0113, .0085, .0089; .0116, .0085, .0089];  % Terminal resistance, R0(SOC,T), (ohm)

R1_mat  = [.0109, .0029, .0013; .0069, .0024, .0012;...
    .0047, .0026, .0013; .0034, .0016, .001; .0033, .0023, .0014;...
    .0033, .0018, .0011; .0028, .0017, .0011];  % First polarization resistance, R1(SOC,T), (ohm)
tau1_mat = [20, 36, 39; 31, 45, 39; 109, 105, 61;...
    36, 29, 26; 59, 77, 67; 40, 33, 29; 25, 39, 33]; % First time constant, tau1(SOC,T), (s)

cell_area = 0.1019; % Cell area (m^2)
h_conv    = 10;      % Heat transfer coefficient (W/(K*m^2))

N0vec =   [1, 5, 10, 15, 20];   % Vector of discharge cycle values
dAHvec = -[1, 7.5, 15, 22, 30]; % Percentage change in cell capacity, dAH(N)

%% Kalman Filters
Ts   = 1;                % Sample time
% SOC estimators
Q    = [5e-5 0; 0 5e-5]; % Covariance of the process noise, Q
R    = 0.35;             % Covariance of the measurement noise, R
P0   = [1e-5 0; 0 1];    % Initial state error covariance, P0
SOC0 = 0.8;              % Initial SOC for estimator 
% Capacity estimator
Q_cap  = 3e-4;           % Covariance of the process noise, Q
R_cap  = 5e-7;           % Covariance of the measurement noise, R
P0_cap = 1e-8;           % Initial state error covariance, P0