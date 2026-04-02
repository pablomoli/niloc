RoNIN Dataset
-------------
The dataset contains 3 buildings in following format:
	building_name
		|--- <seq_1>.hdf5
		|--- <seq_2>.hdf5
		|--- ..
		|--- ..
		|--- train.txt
		|--- val.txt
		|--- test.txt
		
The buildings 'universityB' and 'officeC' are newly collected datasets following a similar data collection procedure to [1]. However, we carry the tango phone in hand instead of attaching to a body harness and imu phone is handled freely. Sequence names follow the pattern "<subject_id><sequence_id>_<device>" where device is [t]ango or [i]mu phone.

The building "universityA" is a subset of RoNIN dataset [1] and few new sequences. We have added the additional data field that gives the groundtruth trajectory aligned to a floorplan. The IMU data comes from IMU phone. The names corresponds to those of RoNIN dataset and follows the pattern "<subject_id>_<sequence_of_subject>". 

The .txt files contain the sequence names of train/ validation/ test split.


HDF5 data format
-----------------
data.hdf5
     |---synced
     |    |--- time, gyro, gyro_uncalib, acce, linacce, gravity, magnet, game_rv, rv
     |---pose
     |    |---tango_pos, tango_ori
     |---computed
     |    |---aligned_pos, ronin
     |---raw
     |    |---wifi_values, wifi_address, wifi_scans



HDF5 data description
---------------------
"synced" group contains time synchronized data from IMU device sampled at 200 Hz.
	- time 	- System time of device in seconds
	- gyro		- Android Sensor.TYPE_GYROSCOPE
	- gyro_uncalib	- Android Sensor.TYPE_GYROSCOPE_UNCALIBRATED
	- acce		- Android Sensor.TYPE_ACCELEROMETER
	- linacce	- Android Sensor.TYPE_LINEAR_ACCELERATION
	- gravity	- Android Sensor.TYPE_GRAVITY
	- magnet	- Android Sensor.TYPE_MAGNETIC_FIELD
	- rv		- Android Sensor.TYPE_ROTATION_VECTOR
	- game_rv	- Android Sensor.TYPE_GAME_ROTATION_VECTOR
	 
"pose" group store all pose information (timestamp for data is "synced/time")
    	- tango_pos	- 3D Positions from Visual SLAM of Tango device [format: (x,y,z)]
    	- tango_ori	- Orientations from Visual SLAM of Tango device [format: (w,x,y,z)]

"computed" group store all processed information used in niloc. (timestamp for data is "synced/time")
    	- aligned_pos	- 2D positions in horizontal plan aligned to a floorplan (computed from Visual SLAM positions) [format: (x,y)]
    	- ronin	- inertial navigation trajectory predicted from RoNIN ResNet model [1] (not aligned to floorplan) [format: (x,y)]
    	
"raw" group contains data as reported by APIs. (time is in same range as "synced/time" in seconds)
	 - wifi - wifi footprints scanned every 3 seconds. stored in 3 parts. See android.net.wifi.ScanResult for field details.
	 	|--"wifi_scans" - contains (scan_number, number of APs)
		|--"wifi_values" - contains (scan_number, last_timestep, level) + [Optional](frequency, freq0, freq1, channelwidth)
		|--"wifi_address" - dataset of type string. contains BSSID of corresponding records in wifi_values
		
	 
[1] Herath, S., Yan, H. and Furukawa, Y., RoNIN: Robust Neural Inertial Navigation in the Wild: Benchmark, Evaluations, & New Methods. ICRA 2020
